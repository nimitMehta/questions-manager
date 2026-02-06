require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const session = require('express-session');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');
const path = require('path');
const fs = require('fs');

// Suppress the specific DEP0170 deprecation warning for MongoDB connection strings
// This warning occurs because MongoDB replica set URLs contain multiple hosts,
// which is valid for MongoDB but triggers Node.js URL parser warnings
const originalEmitWarning = process.emitWarning;
process.emitWarning = function(warning, type, code, ...args) {
    // Check if this is the DEP0170 warning about MongoDB URLs
    const warningStr = typeof warning === 'string' ? warning : (warning?.message || String(warning));
    const isMongoDBDeprecation = 
        code === 'DEP0170' || 
        (warningStr && warningStr.includes('DEP0170') && warningStr.includes('mongodb://')) ||
        (warningStr && warningStr.includes('DEP0170') && warningStr.includes('invalid'));
    
    if (isMongoDBDeprecation) {
        // Suppress this specific deprecation warning
        return;
    }
    // For other warnings, use the original function
    if (originalEmitWarning) {
        return originalEmitWarning.apply(process, [warning, type, code, ...args]);
    }
};

const app = express();

// Helper function to properly encode MongoDB connection string
function encodeMongoURI(uri) {
    try {
        // For mongodb+srv:// URLs, manually parse and encode credentials
        if (uri.startsWith('mongodb+srv://')) {
            // Extract the part after mongodb+srv://
            const afterProtocol = uri.substring(14); // 'mongodb+srv://'.length = 14
            const atIndex = afterProtocol.indexOf('@');
            
            if (atIndex === -1) {
                // No credentials, return as-is
                return uri;
            }
            
            // Split credentials and rest of URL
            const credentials = afterProtocol.substring(0, atIndex);
            const rest = afterProtocol.substring(atIndex + 1);
            
            // Split username and password
            const colonIndex = credentials.indexOf(':');
            if (colonIndex === -1) {
                // Only username, no password
                const encodedUsername = encodeURIComponent(credentials);
                return `mongodb+srv://${encodedUsername}@${rest}`;
            }
            
            const username = credentials.substring(0, colonIndex);
            const password = credentials.substring(colonIndex + 1);
            
            // Encode username and password
            const encodedUsername = encodeURIComponent(username);
            const encodedPassword = encodeURIComponent(password);
            
            return `mongodb+srv://${encodedUsername}:${encodedPassword}@${rest}`;
        } else if (uri.startsWith('mongodb://')) {
            // For standard mongodb:// URLs, try using URL constructor
            // Replace mongodb:// with http:// temporarily for parsing
            const tempUri = uri.replace('mongodb://', 'http://');
            try {
                const url = new URL(tempUri);
                const encodedUsername = encodeURIComponent(url.username || '');
                const encodedPassword = encodeURIComponent(url.password || '');
                const auth = encodedUsername && encodedPassword 
                    ? `${encodedUsername}:${encodedPassword}@` 
                    : encodedUsername ? `${encodedUsername}@` : '';
                return `mongodb://${auth}${url.hostname}${url.port ? ':' + url.port : ''}${url.pathname}${url.search}`;
            } catch (e) {
                // If URL parsing fails, manually parse
                const afterProtocol = uri.substring(10); // 'mongodb://'.length = 10
                const atIndex = afterProtocol.indexOf('@');
                
                if (atIndex === -1) {
                    return uri;
                }
                
                const credentials = afterProtocol.substring(0, atIndex);
                const rest = afterProtocol.substring(atIndex + 1);
                
                const colonIndex = credentials.indexOf(':');
                if (colonIndex === -1) {
                    const encodedUsername = encodeURIComponent(credentials);
                    return `mongodb://${encodedUsername}@${rest}`;
                }
                
                const username = credentials.substring(0, colonIndex);
                const password = credentials.substring(colonIndex + 1);
                const encodedUsername = encodeURIComponent(username);
                const encodedPassword = encodeURIComponent(password);
                
                return `mongodb://${encodedUsername}:${encodedPassword}@${rest}`;
            }
        }
        return uri;
    } catch (error) {
        // If parsing fails, return original URI
        console.warn('Warning: Could not parse MongoDB URI, using as-is:', error.message);
        return uri;
    }
}

const rawUrl = process.env.MONGODB_URI || `mongodb+srv://Bapubaby:JhanviKotak2009@fastners.e3aqj.mongodb.net/question-fillers?retryWrites=true&w=majority`;
const url = encodeMongoURI(rawUrl);

mongoose.connect(url, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log("Connected to DB!!!!");
}).catch((err) => {
    console.log("ERROR:", err.message);
});

// Authentication credentials (you can change these)
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin123';

// Log credential status (production-safe - doesn't expose actual values)
console.log('=== Authentication Configuration ===');
console.log('AUTH_USERNAME from env:', process.env.AUTH_USERNAME ? 'SET' : 'NOT SET (using default)');
console.log('AUTH_PASSWORD from env:', process.env.AUTH_PASSWORD ? 'SET' : 'NOT SET (using default)');
console.log('AUTH_USERNAME value length:', AUTH_USERNAME ? AUTH_USERNAME.length : 0, 'characters');
console.log('AUTH_PASSWORD value length:', AUTH_PASSWORD ? AUTH_PASSWORD.length : 0, 'characters');
console.log('AUTH_USERNAME first char:', AUTH_USERNAME ? AUTH_USERNAME.charAt(0) : 'N/A');
console.log('AUTH_PASSWORD first char:', AUTH_PASSWORD ? AUTH_PASSWORD.charAt(0) : 'N/A');
console.log('===================================');

// Options schema for nested documents
const optionSchema = new mongoose.Schema({
    optionName: { type: String, required: true }, // e.g., "option A", "option B"
    description: { type: String, required: true }
}, { _id: false });

// Questions schema
const questionsSchema = new mongoose.Schema({
    question: { type: String, required: false }, // Made optional to allow image-only questions
    questionImage: { type: String, required: false }, // Path to question image
    options: { type: [optionSchema], required: true },
    correctAnswer: { type: String, required: true }, // e.g., "option C"
    paperName: { type: String, required: true },
    year: { type: String, required: true },
    subjectName: { type: String, required: false },
    topicName: { type: String, required: false },
    chapterNumber: { type: String, required: false },
    correctOptionDescription: { type: String, required: false }, // Made optional to allow image-only explanations
    explanationImage: { type: String, required: false } // Path to explanation image
}, { timestamps: true });

const Question = mongoose.model(
    "questions",
    questionsSchema
);

app.use(require('express-status-monitor')());

// Session configuration
// Note: On Render, secure cookies work with HTTPS. If you're behind a proxy, 
// you may need to set trust proxy: app.set('trust proxy', 1)
const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
        sameSite: 'lax' // CSRF protection
    }
};

// Log session configuration (production-safe)
console.log('=== Session Configuration ===');
console.log('SESSION_SECRET from env:', process.env.SESSION_SECRET ? 'SET' : 'NOT SET (using default)');
console.log('Cookie secure flag:', sessionConfig.cookie.secure);
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('============================');

app.use(session(sessionConfig));

// Trust proxy for secure cookies behind reverse proxy (Render uses this)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
    console.log('Trust proxy enabled for production');
}

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));
app.set('view engine','ejs');

// Configure Cloudinary
const cloudinaryConfig = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
};

// Validate and configure Cloudinary
if (!cloudinaryConfig.cloud_name || !cloudinaryConfig.api_key || !cloudinaryConfig.api_secret) {
    console.warn('⚠️  WARNING: Cloudinary credentials not found in environment variables!');
    console.warn('   Image uploads will fail. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to your .env file');
    console.warn('   See CLOUDINARY_SETUP.md for setup instructions.');
    console.warn('   Current values:', {
        cloud_name: cloudinaryConfig.cloud_name ? 'SET' : 'NOT SET',
        api_key: cloudinaryConfig.api_key ? 'SET' : 'NOT SET',
        api_secret: cloudinaryConfig.api_secret ? 'SET' : 'NOT SET'
    });
} else {
    try {
        // Configure Cloudinary with the credentials
        cloudinary.config({
            cloud_name: cloudinaryConfig.cloud_name,
            api_key: cloudinaryConfig.api_key,
            api_secret: cloudinaryConfig.api_secret
        });
        console.log('✅ Cloudinary configured successfully');
        console.log('   Cloud Name:', cloudinaryConfig.cloud_name);
    } catch (error) {
        console.error('❌ Error configuring Cloudinary:', error.message);
    }
}

// Helper function to extract public_id from Cloudinary URL
function extractPublicIdFromUrl(url) {
    if (!url) return null;
    try {
        // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{folder}/{filename}.{ext}
        // We need: {folder}/{filename} (without extension)
        const urlParts = url.split('/');
        const uploadIndex = urlParts.findIndex(part => part === 'upload');
        if (uploadIndex !== -1 && uploadIndex < urlParts.length - 1) {
            // Get everything after 'upload' and before the last part (which is filename.ext)
            const pathParts = urlParts.slice(uploadIndex + 1);
            if (pathParts.length > 0) {
                const lastPart = pathParts[pathParts.length - 1];
                const filenameWithoutExt = lastPart.replace(/\.[^/.]+$/, '');
                if (pathParts.length > 1) {
                    // Has folder
                    const folder = pathParts.slice(0, -1).join('/');
                    return `${folder}/${filenameWithoutExt}`;
                } else {
                    return filenameWithoutExt;
                }
            }
        }
        // Fallback: try to extract from end of URL
        const match = url.match(/\/([^\/]+)\/([^\/]+)\.(jpg|jpeg|png|gif|webp)$/i);
        if (match) {
            return `${match[1]}/${match[2]}`;
        }
        return null;
    } catch (error) {
        console.error('Error extracting public_id:', error);
        return null;
    }
}

// Configure multer with memory storage (we'll upload to Cloudinary after)
const storage = multer.memoryStorage();

// File filter - only allow images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed! (jpeg, jpg, png, gif, webp)'));
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session && req.session.authenticated) {
        return next();
    } else {
        return res.redirect('/login');
    }
};

// Debug endpoint to check auth configuration (production-safe)
app.get('/debug/auth', (req, res) => {
    res.json({
        authUsernameSet: !!process.env.AUTH_USERNAME,
        authPasswordSet: !!process.env.AUTH_PASSWORD,
        authUsernameLength: AUTH_USERNAME ? AUTH_USERNAME.length : 0,
        authPasswordLength: AUTH_PASSWORD ? AUTH_PASSWORD.length : 0,
        sessionSecretSet: !!process.env.SESSION_SECRET,
        nodeEnv: process.env.NODE_ENV || 'not set',
        cookieSecure: sessionConfig.cookie.secure,
        timestamp: new Date().toISOString()
    });
});

// Login routes
app.get('/login', (req, res) => {
    if (req.session && req.session.authenticated) {
        return res.redirect('/');
    }
    res.render('login', { error: null });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    // Production-safe debug logging
    console.log('=== Login Attempt ===');
    console.log('Username received length:', username ? username.length : 0);
    console.log('Password received length:', password ? password.length : 0);
    console.log('Expected username length:', AUTH_USERNAME ? AUTH_USERNAME.length : 0);
    console.log('Expected password length:', AUTH_PASSWORD ? AUTH_PASSWORD.length : 0);
    console.log('Username exact match:', username === AUTH_USERNAME);
    console.log('Password exact match:', password === AUTH_PASSWORD);
    console.log('Username trimmed match:', username && username.trim() === AUTH_USERNAME);
    console.log('Password trimmed match:', password && password.trim() === AUTH_PASSWORD);
    
    // Check for whitespace issues
    if (username && username !== username.trim()) {
        console.log('WARNING: Username has leading/trailing whitespace!');
    }
    if (password && password !== password.trim()) {
        console.log('WARNING: Password has leading/trailing whitespace!');
    }
    
    // Trim inputs for comparison
    const trimmedUsername = username ? username.trim() : '';
    const trimmedPassword = password ? password.trim() : '';
    
    if (trimmedUsername === AUTH_USERNAME && trimmedPassword === AUTH_PASSWORD) {
        req.session.authenticated = true;
        req.session.username = trimmedUsername;
        console.log('Login SUCCESS');
        console.log('================');
        return res.redirect('/');
    } else {
        console.log('Login FAILED');
        console.log('================');
        return res.render('login', { error: 'Invalid username or password' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log('Error destroying session:', err);
        }
        res.redirect('/login');
    });
});

// Home route - list papers and by-topic groups (protected)
app.get('/', requireAuth, async (req, res) => {
    // Papers: group by paperName + year (exclude "By Topic" / "Unknown" for separate section)
    const papersAgg = await Question.aggregate([
        { $match: { $or: [{ paperName: { $ne: 'By Topic' } }, { year: { $ne: 'Unknown' } }] } },
        { $group: { _id: { paperName: '$paperName', year: '$year' }, questionCount: { $sum: 1 } } },
        { $sort: { '_id.paperName': 1, '_id.year': -1 } }
    ]);
    const papersList = papersAgg.map(p => ({
        paperName: p._id.paperName,
        year: p._id.year,
        questionCount: p.questionCount
    }));

    // By-topic: show only subjects on home (group by subjectName only)
    const subjectAgg = await Question.aggregate([
        { $match: { paperName: 'By Topic', year: 'Unknown' } },
        { $group: { _id: '$subjectName', questionCount: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);
    const subjectList = subjectAgg.map(s => ({
        subjectName: s._id || '',
        questionCount: s.questionCount
    }));

    res.render('home', { papersList, subjectList, username: req.session.username });
});

// Subject detail: list chapters under a subject (chapterNumber.subjectName)
app.get('/paper/by-subject', requireAuth, async (req, res) => {
    const subjectName = req.query.subjectName;
    if (!subjectName) return res.redirect('/');

    const chapterAgg = await Question.aggregate([
        { $match: { paperName: 'By Topic', year: 'Unknown', subjectName: subjectName } },
        { $group: { _id: '$chapterNumber', questionCount: { $sum: 1 } } },
        { $sort: { _id: 1 } }
    ]);
    const chaptersList = chapterAgg.map(c => ({
        chapterNumber: c._id || '',
        questionCount: c.questionCount
    }));

    res.render('subjectDetail', {
        subjectName,
        chaptersList,
        username: req.session.username
    });
});

// View questions for a specific paper (protected)
app.get('/paper/:paperName/:year', requireAuth, async (req, res) => {
    const { paperName, year } = req.params;
    const decodedPaperName = decodeURIComponent(paperName);
    const decodedYear = decodeURIComponent(year);
    
    const questionsList = await Question.find({
        paperName: decodedPaperName,
        year: decodedYear
    }).sort({ createdAt: -1 });
    
    res.render('viewQuestions', {
        questionsList,
        paperName: decodedPaperName,
        year: decodedYear,
        displayTitle: null,
        username: req.session.username
    });
});

// View questions for a subject/topic/chapter group (protected)
app.get('/paper/by-topic', requireAuth, async (req, res) => {
    const { subjectName, topicName, chapterNumber } = req.query;
    if (!subjectName && !topicName && !chapterNumber) {
        return res.redirect('/');
    }
    
    const filter = { paperName: 'By Topic', year: 'Unknown' };
    if (subjectName) filter.subjectName = subjectName;
    if (topicName) filter.topicName = topicName;
    if (chapterNumber) filter.chapterNumber = chapterNumber;
    
    const questionsList = await Question.find(filter).sort({ createdAt: -1 });
    const parts = [subjectName, topicName, chapterNumber ? `Ch. ${chapterNumber}` : ''].filter(Boolean);
    const displayTitle = parts.length ? parts.join(' / ') : 'By Topic';
    
    res.render('viewQuestions', {
        questionsList,
        paperName: 'By Topic',
        year: 'Unknown',
        displayTitle,
        isByTopic: true,
        subjectName: subjectName || '',
        topicName: topicName || '',
        chapterNumber: chapterNumber || '',
        username: req.session.username
    });
});

// Start adding questions - get paper name and year, redirect to add page (protected)
app.post('/question/start', requireAuth, (req, res) => {
    const { paperName, year } = req.body;
    const encodedPaperName = encodeURIComponent(paperName);
    const encodedYear = encodeURIComponent(year);
    res.redirect(`/question/add?paperName=${encodedPaperName}&year=${encodedYear}`);
});

// Start adding questions by subject/topic/chapter (year = Unknown) (protected)
app.post('/question/start-by-topic', requireAuth, (req, res) => {
    const { subjectName, topicName, chapterNumber } = req.body;
    const paperName = 'By Topic';
    const year = 'Unknown';
    const params = new URLSearchParams({
        paperName,
        year,
        subjectName: subjectName || '',
        topicName: topicName || '',
        chapterNumber: chapterNumber || ''
    });
    res.redirect(`/question/add?${params.toString()}`);
});

// Get add question page with paper name and year, or subject/topic/chapter (protected)
app.get('/question/add', requireAuth, (req, res) => {
    const { paperName, year, subjectName, topicName, chapterNumber } = req.query;
    if (!paperName || !year) {
        return res.redirect('/');
    }
    res.render('addQuestion', {
        paperName,
        year,
        subjectName: subjectName || '',
        topicName: topicName || '',
        chapterNumber: chapterNumber || ''
    });
});

// Post add question (protected)
app.post('/question/add', requireAuth, upload.fields([
    { name: 'questionImage', maxCount: 1 },
    { name: 'explanationImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { question, paperName, year, correctAnswer, correctOptionDescription, subjectName, topicName, chapterNumber } = req.body;
        
        // Validate that either question text or question image is provided (or both)
        if (!question && !req.files?.questionImage) {
            return res.status(400).send('Please provide question text, question image, or both.');
        }
        
        // Build options array from form data
        const options = [];
        const optionNames = ['option A', 'option B', 'option C', 'option D'];
        
        for (let i = 0; i < optionNames.length; i++) {
            const optionDesc = req.body[`option${i}`];
            if (optionDesc && optionDesc.trim() !== '') {
                options.push({
                    optionName: optionNames[i],
                    description: optionDesc
                });
            }
        }
        
        // Upload images to Cloudinary if provided
        let questionImageUrl = null;
        let explanationImageUrl = null;
        
        // Check if Cloudinary is configured (re-check from env to be sure)
        const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
        
        if (req.files?.questionImage) {
            if (!isCloudinaryConfigured) {
                return res.status(500).send('Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to your environment variables. See CLOUDINARY_SETUP.md for instructions.');
            }
            
            // Ensure Cloudinary is configured before upload - always reconfigure to be safe
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            });
            
            try {
                const result = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: 'questions-manager/questions',
                            transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    streamifier.createReadStream(req.files.questionImage[0].buffer).pipe(uploadStream);
                });
                questionImageUrl = result.secure_url;
            } catch (error) {
                console.error('Error uploading question image:', error);
                return res.status(500).send('Error uploading question image: ' + error.message);
            }
        }
        
        if (req.files?.explanationImage) {
            if (!isCloudinaryConfigured) {
                return res.status(500).send('Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to your environment variables. See CLOUDINARY_SETUP.md for instructions.');
            }
            
            // Ensure Cloudinary is configured before upload - always reconfigure to be safe
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            });
            
            try {
                const result = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: 'questions-manager/explanations',
                            transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    streamifier.createReadStream(req.files.explanationImage[0].buffer).pipe(uploadStream);
                });
                explanationImageUrl = result.secure_url;
            } catch (error) {
                console.error('Error uploading explanation image:', error);
                return res.status(500).send('Error uploading explanation image: ' + error.message);
            }
        }
        
        // Debug logging
        console.log('=== Saving Question to Database ===');
        console.log('Question length:', question ? question.length : 0, 'characters');
        console.log('Question image:', questionImageUrl || 'none');
        console.log('Explanation image:', explanationImageUrl || 'none');
        console.log('Options count:', options.length);
        console.log('===================================');
        
        await Question.create({ 
            question: question || '', 
            questionImage: questionImageUrl,
            options, 
            correctAnswer, 
            paperName, 
            year, 
            subjectName: subjectName || '',
            topicName: topicName || '',
            chapterNumber: chapterNumber || '',
            correctOptionDescription: correctOptionDescription || '',
            explanationImage: explanationImageUrl
        });
        
        // Redirect back to add page with same paper name and year to add more questions
        const encodedPaperName = encodeURIComponent(paperName);
        const encodedYear = encodeURIComponent(year);
        res.redirect(`/question/add?paperName=${encodedPaperName}&year=${encodedYear}`);
    } catch (error) {
        console.error('Error saving question:', error);
        res.status(500).send('Error saving question: ' + error.message);
    }
});

// Get edit question page (protected)
app.get('/question/edit/:questionId', requireAuth, async (req, res) => {
    const question = await Question.findById(req.params.questionId);
    res.render('editQuestion', { question });
});

// Post edit question (protected)
app.post('/question/edit/:questionId', requireAuth, upload.fields([
    { name: 'questionImage', maxCount: 1 },
    { name: 'explanationImage', maxCount: 1 }
]), async (req, res) => {
    try {
        const { question, paperName, year, correctAnswer, correctOptionDescription, subjectName, topicName, chapterNumber, deleteQuestionImage, deleteExplanationImage } = req.body;
        
        // Get existing question to check for old images
        const existingQuestion = await Question.findById(req.params.questionId);
        if (!existingQuestion) {
            return res.status(404).send('Question not found');
        }
        
        // Build options array from form data
        const options = [];
        const optionNames = ['option A', 'option B', 'option C', 'option D'];
        
        for (let i = 0; i < optionNames.length; i++) {
            const optionDesc = req.body[`option${i}`];
            if (optionDesc && optionDesc.trim() !== '') {
                options.push({
                    optionName: optionNames[i],
                    description: optionDesc
                });
            }
        }
        
        // Handle image updates
        let questionImageUrl = existingQuestion.questionImage;
        let explanationImageUrl = existingQuestion.explanationImage;
        
        // Delete old images from Cloudinary if requested
        if (deleteQuestionImage === 'true' && existingQuestion.questionImage) {
            try {
                const publicId = extractPublicIdFromUrl(existingQuestion.questionImage);
                if (publicId) {
                    await cloudinary.uploader.destroy(publicId);
                }
                questionImageUrl = null;
            } catch (error) {
                console.error('Error deleting question image from Cloudinary:', error);
            }
        }
        
        if (deleteExplanationImage === 'true' && existingQuestion.explanationImage) {
            try {
                const publicId = extractPublicIdFromUrl(existingQuestion.explanationImage);
                if (publicId) {
                    await cloudinary.uploader.destroy(publicId);
                }
                explanationImageUrl = null;
            } catch (error) {
                console.error('Error deleting explanation image from Cloudinary:', error);
            }
        }
        
        // Check if Cloudinary is configured (re-check from env to be sure)
        const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;
        
        // Upload new images to Cloudinary if provided
        if (req.files?.questionImage) {
            if (!isCloudinaryConfigured) {
                return res.status(500).send('Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to your environment variables. See CLOUDINARY_SETUP.md for instructions.');
            }
            
            // Ensure Cloudinary is configured before upload - always reconfigure to be safe
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            });
            
            try {
                // Delete old image from Cloudinary if exists
                if (existingQuestion.questionImage) {
                    try {
                        const publicId = extractPublicIdFromUrl(existingQuestion.questionImage);
                        if (publicId) {
                            await cloudinary.uploader.destroy(publicId);
                        }
                    } catch (error) {
                        console.error('Error deleting old question image:', error);
                    }
                }
                
                // Upload new image
                const result = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: 'questions-manager/questions',
                            transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    streamifier.createReadStream(req.files.questionImage[0].buffer).pipe(uploadStream);
                });
                questionImageUrl = result.secure_url;
            } catch (error) {
                console.error('Error uploading question image:', error);
                return res.status(500).send('Error uploading question image: ' + error.message);
            }
        }
        
        if (req.files?.explanationImage) {
            if (!isCloudinaryConfigured) {
                return res.status(500).send('Cloudinary is not configured. Please add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET to your environment variables. See CLOUDINARY_SETUP.md for instructions.');
            }
            
            // Ensure Cloudinary is configured before upload - always reconfigure to be safe
            cloudinary.config({
                cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
                api_key: process.env.CLOUDINARY_API_KEY,
                api_secret: process.env.CLOUDINARY_API_SECRET
            });
            
            try {
                // Delete old image from Cloudinary if exists
                if (existingQuestion.explanationImage) {
                    try {
                        const publicId = extractPublicIdFromUrl(existingQuestion.explanationImage);
                        if (publicId) {
                            await cloudinary.uploader.destroy(publicId);
                        }
                    } catch (error) {
                        console.error('Error deleting old explanation image:', error);
                    }
                }
                
                // Upload new image
                const result = await new Promise((resolve, reject) => {
                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            folder: 'questions-manager/explanations',
                            transformation: [{ width: 1200, height: 1200, crop: 'limit' }]
                        },
                        (error, result) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    );
                    streamifier.createReadStream(req.files.explanationImage[0].buffer).pipe(uploadStream);
                });
                explanationImageUrl = result.secure_url;
            } catch (error) {
                console.error('Error uploading explanation image:', error);
                return res.status(500).send('Error uploading explanation image: ' + error.message);
            }
        }
        
        await Question.findByIdAndUpdate(req.params.questionId, { 
            question: question || '',
            questionImage: questionImageUrl,
            options, 
            correctAnswer, 
            paperName, 
            year, 
            subjectName: subjectName || '',
            topicName: topicName || '',
            chapterNumber: chapterNumber || '',
            correctOptionDescription: correctOptionDescription || '',
            explanationImage: explanationImageUrl
        });
        
        // Redirect back: by-topic group or paper
        if (paperName === 'By Topic' && year === 'Unknown' && (subjectName || topicName || chapterNumber)) {
            const q = new URLSearchParams({ subjectName: subjectName || '', topicName: topicName || '', chapterNumber: chapterNumber || '' });
            return res.redirect(`/paper/by-topic?${q.toString()}`);
        }
        const encodedPaperName = encodeURIComponent(paperName);
        const encodedYear = encodeURIComponent(year);
        res.redirect(`/paper/${encodedPaperName}/${encodedYear}`);
    } catch (error) {
        console.error('Error updating question:', error);
        res.status(500).send('Error updating question: ' + error.message);
    }
});

// Delete question (protected)
app.post('/question/delete/:questionId', requireAuth, async (req, res) => {
    try {
        const question = await Question.findById(req.params.questionId);
        if (question) {
            // Delete associated images
            if (question.questionImage) {
                const questionImagePath = path.join(__dirname, question.questionImage);
                if (fs.existsSync(questionImagePath)) {
                    fs.unlinkSync(questionImagePath);
                }
            }
            if (question.explanationImage) {
                const explanationImagePath = path.join(__dirname, question.explanationImage);
                if (fs.existsSync(explanationImagePath)) {
                    fs.unlinkSync(explanationImagePath);
                }
            }
            
            await Question.findByIdAndDelete(req.params.questionId);
            if (question.paperName === 'By Topic' && question.year === 'Unknown' && (question.subjectName || question.topicName || question.chapterNumber)) {
                const q = new URLSearchParams({
                    subjectName: question.subjectName || '',
                    topicName: question.topicName || '',
                    chapterNumber: question.chapterNumber || ''
                });
                return res.redirect(`/paper/by-topic?${q.toString()}`);
            }
            const encodedPaperName = encodeURIComponent(question.paperName);
            const encodedYear = encodeURIComponent(question.year);
            res.redirect(`/paper/${encodedPaperName}/${encodedYear}`);
        } else {
            res.redirect('/');
        }
    } catch (error) {
        console.error('Error deleting question:', error);
        res.status(500).send('Error deleting question: ' + error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server has Started on port ${PORT}`);
});
