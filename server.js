const express = require('express');
const cors = require('cors');
const weaviate = require('weaviate-client');

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

// Initialize Weaviate client - REPLACE with your actual Weaviate instance details
const client = weaviate.client({
  scheme: 'http', // or 'https'
  host: 'localhost:8080', // Replace with your Weaviate host
  // apiKey: new weaviate.ApiKey('YOUR_WEAVIATE_API_KEY'), // Uncomment if authentication is required
});

app.post('/api/search', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  try {
    const weaviateRes = await client.graphql
      .get()
      .withClassName('YourCollectionName') // Replace with your Weaviate collection name
      .withNearText({ concepts: [query] })
      .withFields('description instanceID requesterName requesterEmail pdfFileId content chunkIndex chunkCount source chunkId')
      .withLimit(1) // Adjust limit as needed
      .do();

    res.json(weaviateRes);
  } catch (error) {
    console.error('Error fetching from Weaviate:', error);
    res.status(500).json({ error: 'Error fetching from Weaviate' });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
