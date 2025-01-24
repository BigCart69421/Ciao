const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const app = express();
const port = 3000;

// Define the upload directory and files
const uploadDir = path.join(__dirname, 'public', 'uploads');
const commentsFile = path.join(__dirname, 'comments.json');
const usersFile = path.join(__dirname, 'users.json');

// Ensure the upload directory and files exist
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Uploads directory created.');
}

if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, '{}');
}
if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, '{}');
}

// Set up Multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Middleware for session handling
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Initialize Passport and restore authentication state
app.use(passport.initialize());
app.use(passport.session());

// Passport Local Strategy
passport.use(new LocalStrategy((username, password, done) => {
    fs.readFile(usersFile, (err, data) => {
        if (err) return done(err);
        const users = JSON.parse(data);
        const user = users[username];
        if (!user) return done(null, false);
        bcrypt.compare(password, user.password, (err, result) => {
            if (err) return done(err);
            if (result) return done(null, user);
            return done(null, false);
        });
    });
}));

passport.serializeUser((user, done) => {
    done(null, user.username);
});

passport.deserializeUser((username, done) => {
    fs.readFile(usersFile, (err, data) => {
        if (err) return done(err);
        const users = JSON.parse(data);
        const user = users[username];
        done(null, user);
    });
});

// Middleware to serve static files from the 'public' directory
app.use(express.static('public'));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve the home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the upload page (only if logged in)
app.get('/upload', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

// Serve the view page (only if logged in)
app.get('/view', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'view.html'));
});

// Handle file uploads with comments
app.post('/upload', ensureAuthenticated, upload.single('media'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const comment = req.body.comment || '';
    const fileData = {
        filename: req.file.filename,
        originalname: req.file.originalname,
        comment: comment
    };

    // Read existing comments
    fs.readFile(commentsFile, (err, data) => {
        let comments = {};
        if (err) {
            return res.status(500).json({ error: 'Unable to read comments file' });
        }
        try {
            comments = JSON.parse(data);
        } catch (e) {
            comments = {};
        }

        comments[req.file.filename] = fileData;

        // Save new comments
        fs.writeFile(commentsFile, JSON.stringify(comments, null, 2), err => {
            if (err) {
                return res.status(500).json({ error: 'Unable to save comments' });
            }

            res.json({ file: fileData });
        });
    });
});

// List media files with comments
app.get('/media', ensureAuthenticated, (req, res) => {
    fs.readdir(uploadDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Unable to scan files!' });
        }

        fs.readFile(commentsFile, (err, data) => {
            let comments = {};
            if (err) {
                return res.status(500).json({ error: 'Unable to read comments file' });
            }
            try {
                comments = JSON.parse(data);
            } catch (e) {
                comments = {};
            }

            const mediaFiles = files.map(file => {
                const ext = path.extname(file).substring(1);
                return {
                    name: file,
                    url: `/uploads/${file}`,
                    type: ext,
                    comment: comments[file] ? comments[file].comment : ''
                };
            });

            res.json(mediaFiles);
        });
    });
});

// Serve uploaded media files
app.get('/uploads/:filename', (req, res) => {
    const filePath = path.join(uploadDir, req.params.filename);
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            return res.status(404).json({ error: 'File not found' });
        }
        res.sendFile(filePath);
    });
});

// Login form handler
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Handle login POST requests
app.post('/login', passport.authenticate('local', {
    successRedirect: '/upload',
    failureRedirect: '/login',
    failureFlash: true
}));

// Handle logout
app.get('/logout', (req, res) => {
    req.logout();
    res.redirect('/');
});

// Registration form handler
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Handle registration POST requests
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    fs.readFile(usersFile, (err, data) => {
        if (err) return res.status(500).json({ error: 'Unable to read users file' });

        const users = JSON.parse(data);

        if (users[username]) {
            return res.status(400).json({ error: 'User already exists.' });
        }

        bcrypt.hash(password, 10, (err, hashedPassword) => {
            if (err) return res.status(500).json({ error: 'Error hashing password' });

            users[username] = { username, password: hashedPassword };

            fs.writeFile(usersFile, JSON.stringify(users, null, 2), err => {
                if (err) return res.status(500).json({ error: 'Error saving user' });
                res.redirect('/login');
            });
        });
    });
});

// Middleware to check authentication
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/login');
}

// Handle 404 errors
app.use((req, res) => {
    res.status(404).send('404 Not Found');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
