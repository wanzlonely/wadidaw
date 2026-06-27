const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Redis = require('ioredis');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const redis = new Redis(process.env.UPSTASH_REDIS_URL);

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') return res.sendStatus(403);
    next();
};

app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    const exists = await redis.hget('users', username);
    if (exists) return res.status(400).json({ error: 'User exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { username, password: hashedPassword, balance: 0, role: 'user' };
    await redis.hset('users', username, JSON.stringify(user));
    res.status(201).json({ message: 'Registered' });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const userData = await redis.hget('users', username);
    if (!userData) return res.status(400).json({ error: 'Not found' });
    const user = JSON.parse(userData);
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(403).json({ error: 'Invalid password' });
    const token = jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET);
    res.json({ token, balance: user.balance, role: user.role });
});

app.post('/api/deposit', authenticateToken, async (req, res) => {
    const { amount } = req.body;
    if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const userData = await redis.hget('users', req.user.username);
    const user = JSON.parse(userData);
    user.balance += amount;
    await redis.hset('users', req.user.username, JSON.stringify(user));
    res.json({ balance: user.balance });
});

app.post('/api/matches', authenticateToken, isAdmin, async (req, res) => {
    const { matchId, teamA, teamB } = req.body;
    const match = { id: matchId, teamA, teamB, status: 'open', poolA: 0, poolB: 0 };
    await redis.hset('matches', matchId, JSON.stringify(match));
    res.json(match);
});

app.get('/api/matches', async (req, res) => {
    const matchesData = await redis.hgetall('matches');
    const matches = Object.values(matchesData).map(m => JSON.parse(m));
    res.json(matches);
});

app.post('/api/bet', authenticateToken, async (req, res) => {
    const { matchId, group, amount } = req.body;
    if (amount < 5000 || amount > 100000) return res.status(400).json({ error: 'Limit 5k - 100k' });
    if (group !== 'A' && group !== 'B') return res.status(400).json({ error: 'Invalid group' });

    const userData = await redis.hget('users', req.user.username);
    const user = JSON.parse(userData);
    if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    const matchData = await redis.hget('matches', matchId);
    if (!matchData) return res.status(404).json({ error: 'Match not found' });
    const match = JSON.parse(matchData);
    if (match.status !== 'open') return res.status(400).json({ error: 'Match closed' });

    user.balance -= amount;
    await redis.hset('users', req.user.username, JSON.stringify(user));

    if (group === 'A') match.poolA += amount;
    if (group === 'B') match.poolB += amount;
    await redis.hset('matches', matchId, JSON.stringify(match));

    const bet = { username: req.user.username, group, amount };
    await redis.rpush(`bets:${matchId}`, JSON.stringify(bet));

    res.json({ message: 'Bet placed', balance: user.balance });
});

app.post('/api/resolve', authenticateToken, isAdmin, async (req, res) => {
    const { matchId, winnerGroup } = req.body;
    if (winnerGroup !== 'A' && winnerGroup !== 'B') return res.status(400).json({ error: 'Invalid winner' });

    const matchData = await redis.hget('matches', matchId);
    if (!matchData) return res.status(404).json({ error: 'Match not found' });
    const match = JSON.parse(matchData);
    if (match.status !== 'open') return res.status(400).json({ error: 'Match closed' });

    match.status = 'resolved';
    match.winner = winnerGroup;
    await redis.hset('matches', matchId, JSON.stringify(match));

    const betsData = await redis.lrange(`bets:${matchId}`, 0, -1);
    const bets = betsData.map(b => JSON.parse(b));

    const winningPool = winnerGroup === 'A' ? match.poolA : match.poolB;
    const losingPool = winnerGroup === 'A' ? match.poolB : match.poolA;

    for (const bet of bets) {
        if (bet.group === winnerGroup) {
            const proportion = bet.amount / winningPool;
            const winnings = proportion * losingPool;
            const totalReturn = bet.amount + winnings;

            const userData = await redis.hget('users', bet.username);
            if (userData) {
                const user = JSON.parse(userData);
                user.balance += totalReturn;
                await redis.hset('users', bet.username, JSON.stringify(user));
            }
        }
    }

    res.json({ message: 'Resolved and distributed', match });
});

app.post('/api/withdraw', authenticateToken, async (req, res) => {
    const { amount, bankAccount } = req.body;
    if (amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const userData = await redis.hget('users', req.user.username);
    const user = JSON.parse(userData);
    if (user.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

    user.balance -= amount;
    await redis.hset('users', req.user.username, JSON.stringify(user));

    const wdRequest = { username: req.user.username, amount, bankAccount, status: 'pending', date: new Date().toISOString() };
    await redis.rpush('withdrawals', JSON.stringify(wdRequest));

    res.json({ message: 'Withdrawal requested', balance: user.balance });
});

app.listen(process.env.PORT, () => {
    console.log(`Server started`);
});
