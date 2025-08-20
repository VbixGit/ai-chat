require('dotenv').config();
const express = require('express');
const cors = require('cors');
const weaviate = require('weaviate-client').default;
const OpenAI = require('openai');

async function main() {
  const app = express();
  const port = 3001;

  app.use(cors());
  app.use(express.json());

  console.log('Connecting to Weaviate...');
  try {
    const client = await weaviate.connectToWeaviateCloud(process.env.WEAVIATE_ENDPOINT, {
        authCredentials: new weaviate.ApiKey(process.env.WEAVIATE_API_KEY),
        headers: { 'X-OpenAI-Api-Key': process.env.OPENAI_API_KEY }
    });
    
    await client.isReady();
    console.log('Successfully connected to Weaviate.');

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    app.post('/api/ask', async (req, res) => {
      const { question, chatHistory = [] } = req.body;

      if (!question) {
        return res.status(400).json({ error: 'Question is required' });
      }

      console.log(`Step 1: Get text from user: "${question}"`);
      try {
        const classification = await classifyQuestion(openai, question);
        const { embedding } = await generateQuestionEmbedding(openai, question);
        const docs = await searchWeaviate(client, embedding, classification);
        console.log(`Step 6: Using all ${docs.length} documents from Weaviate.`);

        if (docs.length === 0) {
          return res.json({
            answer: "I couldn't find any information matching your question. Please try rephrasing it.",
            citations: [],
          });
        }

        const context = docs
          .map((d, i) => `Document #${i + 1}:\n- Description: ${d.description}\n- Content: ${d.content}\n- Source: ${d.source}\n- Requester: ${d.requesterName} <${d.requesterEmail}>\n- PDF File ID: ${d.pdfFileId}\n- Instance ID: ${d.instanceID}\n- Chunk Index: ${d.chunkIndex}\n- Chunk Count: ${d.chunkCount}\n- Chunk ID: ${d.chunkId}\n- Relevance Score (distance): ${d._additional.distance}`)
          .join('\n\n---\n\n');

        const answer = await generateAnswer(openai, context, question, chatHistory);
        const citations = docs.map((d, i) => ({
          index: i + 1,
          title: d.description || `Document ${i + 1}`,
          source: d.source,
        }));

        const response = { answer, citations };
        console.log('Step 9: Returning final response:', JSON.stringify(response, null, 2));
        res.json(response);
      } catch (err) {
        console.error('Error in askQuestion:', err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        res.status(500).json({ error: `Internal server error: ${errorMessage}` });
      }
    });

    app.listen(port, () => {
      console.log(`Server listening at http://localhost:${port}`);
    });

  } catch (error) {
    console.error('Failed to connect to Weaviate or start the server:', error);
    process.exit(1);
  }
}

async function classifyQuestion(openai, question) {
  console.log('Step 2.1: Classifying question...');
  const systemPrompt = `You are a helpful AI assistant. Your task is to classify the user's question into one of two categories: "Policy" or "Resume". Respond with only "Policy" or "Resume".`;
  const userPrompt = `Question: ${question}`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let classification = response.choices[0].message.content.trim();
  if (classification !== 'Policy' && classification !== 'Resume') {
    console.warn(`Unexpected classification result: "${classification}". Defaulting to "Policy".`);
    classification = 'Policy';
  }
  console.log(`Step 2.2: Classified question as "${classification}"`);
  return classification;
}

async function generateQuestionEmbedding(openai, question) {
  console.log('Step 2: Embedding text using OpenAI...');
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: question,
  });
  const embedding = response.data[0].embedding;
  console.log(`Step 3: Embedding data: {*embedding data of length ${embedding.length}*}`);
  return { embedding };
}

async function searchWeaviate(client, vector, classification) {
    console.log(`Step 4: Searching Weaviate with the embedding vector for classification: ${classification}...`);
    const className = classification === 'Policy' ? 'TestPolicyUpload' : 'ApplicantCV';
    const topK = parseInt(process.env.TOP_K || '5', 10);
  
    const query = `
      {
        Get {
          ${className}(
            nearVector: { vector: ${JSON.stringify(vector)} }
            limit: ${topK}
          ) {
            description
            instanceID
            requesterName
            requesterEmail
            pdfFileId
            content
            chunkIndex
            chunkCount
            source
            chunkId
            _additional { distance }
          }
        }
      }
    `;
    
    try {
      const result = await client.graphql.raw({ query });
      const documents = result.data.Get[className] || [];
      console.log(`Step 5: Found ${documents.length} documents in Weaviate`);
      return documents;
    } catch (error) {
      console.error('Weaviate search failed:', error);
      throw new Error(`Weaviate search failed: ${error.message}`);
    }
}

async function generateAnswer(openai, context, question, chatHistory) {
  console.log('Step 7: Generating answer with context using OpenAI...');
  const systemPrompt = `You are a helpful AI assistant. Your task is to answer the user's question based on the provided context and chat history. Synthesize the information from the documents to provide a comprehensive and natural-sounding answer. If the information is not in the context, say that you couldn't find the information. Do not make up information. Maintain a conversational and friendly tone, like a human would. If the user's question is a follow-up to a previous question, use the chat history to understand the context of the conversation.`;
  const userPrompt = `Question: ${question}\n\nContext:\n${context}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: userPrompt },
  ];

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_CHAT_MODEL || 'gpt-4o',
    temperature: 0.2,
    messages: messages,
  });

  const answer = response.choices[0].message.content.trim();
  console.log(`Step 8: Generated answer: "${answer}"`);
  return answer;
}

main();
