const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for base64 images
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Create a simple JSON database file for storing image metadata
const dbPath = path.join(__dirname, 'images.json');
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([]));
}

// Helper function to read database
const readDatabase = () => {
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

// Helper function to write to database
const writeDatabase = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

// Helper function to extract image format from base64 string
const getImageFormat = (base64String) => {
  const matches = base64String.match(/^data:image\/([a-zA-Z]*);base64,/);
  return matches ? matches[1] : 'png';
};

// POST route to handle base64 image upload
app.post('/upload-image', async (req, res) => {
  try {
    const { image, name } = req.body;

    if (!image) {
      return res.status(400).json({ 
        error: 'No image data provided. Please send base64 image string in the "image" field.' 
      });
    }

    // Validate base64 format
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ 
        error: 'Invalid image format. Please provide a valid base64 image string starting with "data:image/"' 
      });
    }

    // Generate unique ID and extract image format
    const imageId = uuidv4();
    const imageFormat = getImageFormat(image);
    const imageName = name || `image_${Date.now()}`;

    // Remove the data URL prefix and decode base64
    const base64Data = image.replace(/^data:image\/[a-z]+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Save image to file system
    const fileName = `${imageId}.${imageFormat}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, imageBuffer);

    // Save metadata to database
    const database = readDatabase();
    const imageRecord = {
      id: imageId,
      name: imageName,
      format: imageFormat,
      fileName: fileName,
      size: imageBuffer.length,
      uploadedAt: new Date().toISOString()
    };
    database.push(imageRecord);
    writeDatabase(database);

    // Return the image as response
    res.set({
      'Content-Type': `image/${imageFormat}`,
      'Content-Length': imageBuffer.length,
      'X-Image-ID': imageId,
      'X-Image-Name': imageName
    });

    res.send(imageBuffer);

  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ 
      error: 'Internal server error while processing image',
      message: error.message 
    });
  }
});

// GET route to retrieve image by ID (bonus feature)
app.get('/image/:id', (req, res) => {
  try {
    const { id } = req.params;
    const database = readDatabase();
    const imageRecord = database.find(img => img.id === id);

    if (!imageRecord) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const filePath = path.join(uploadsDir, imageRecord.fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Image file not found on server' });
    }

    const imageBuffer = fs.readFileSync(filePath);
    
    res.set({
      'Content-Type': `image/${imageRecord.format}`,
      'Content-Length': imageBuffer.length,
      'X-Image-ID': imageRecord.id,
      'X-Image-Name': imageRecord.name
    });

    res.send(imageBuffer);

  } catch (error) {
    console.error('Error retrieving image:', error);
    res.status(500).json({ 
      error: 'Internal server error while retrieving image',
      message: error.message 
    });
  }
});

// GET route to list all images (bonus feature)
app.get('/images', (req, res) => {
  try {
    const database = readDatabase();
    res.json({
      total: database.length,
      images: database.map(img => ({
        id: img.id,
        name: img.name,
        format: img.format,
        size: img.size,
        uploadedAt: img.uploadedAt,
        url: `/image/${img.id}`
      }))
    });
  } catch (error) {
    console.error('Error listing images:', error);
    res.status(500).json({ 
      error: 'Internal server error while listing images',
      message: error.message 
    });
  }
});

// Health check route
app.get('/', (req, res) => {
  res.json({ 
    message: 'Express Image Server is running!',
    endpoints: {
      'POST /upload-image': 'Upload base64 image and get image back',
      'GET /image/:id': 'Retrieve image by ID',
      'GET /images': 'List all uploaded images'
    },
    usage: {
      upload: 'Send POST request with { "image": "data:image/png;base64,..." } to /upload-image',
      example: 'curl -X POST -H "Content-Type: application/json" -d \'{"image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="}\' http://localhost:3000/upload-image'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Express Image Server running on port ${PORT}`);
  console.log(`📝 API Documentation:`);
  console.log(`   POST /upload-image - Upload base64 image`);
  console.log(`   GET  /image/:id    - Retrieve image by ID`);
  console.log(`   GET  /images       - List all images`);
  console.log(`💡 Example usage:`);
  console.log(`   curl -X POST -H "Content-Type: application/json" \\`);
  console.log(`        -d '{"image":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="}' \\`);
  console.log(`        http://localhost:${PORT}/upload-image`);
});