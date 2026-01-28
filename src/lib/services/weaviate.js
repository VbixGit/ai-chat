/**
 * WEAVIATE SERVICE MODULE
 * RAG retrieval from Weaviate knowledge base
 *
 * DECISION: REFACTOR from server.js searchWeaviate()
 * Made flow-aware and generalized for all flows
 */

import { WEAVIATE_CONFIG, OPENAI_CONFIG } from "../../config/env";
import {
  getWeaviateClassesForFlow,
  getWeaviateFieldsForFlow,
  getTranslateQueryToThaiForFlow,
} from "../../config/flows";
import {
  generateEmbedding,
  translateToThai,
  translateToEnglish,
} from "./openai";
import { debug, debugJson } from "../utils/debug";

export async function queryWeaviate(retrieval) {
  const {
    flowKey,
    query,
    limit = WEAVIATE_CONFIG.topK,
    scoreThreshold = WEAVIATE_CONFIG.scoreThreshold,
  } = retrieval;

  if (!WEAVIATE_CONFIG.url) {
    throw new Error("Weaviate URL not configured");
  }

  try {
    console.log(`🔍 Querying Weaviate for ${flowKey} flow...`);
    debug("queryWeaviate params:", { flowKey, query, limit, scoreThreshold });

    // Translate query depending on flow rules:
    // - HR: translate to English before embedding
    // - TOR: translate to Thai before embedding (config)
    // - Others: use original or flow-config translation
    let queryToEmbed = query;
    if (flowKey === "HR") {
      queryToEmbed = await translateToEnglish(query);
    } else if (getTranslateQueryToThaiForFlow(flowKey)) {
      queryToEmbed = await translateToThai(query);
    }

    // Get embedding for query
    const embeddingResult = await generateEmbedding({ text: queryToEmbed });
    const embedding = embeddingResult.embedding;
    debugJson("embeddingResult", { length: embedding?.length || 0 });

    // Get Weaviate class for this flow
    const classes = getWeaviateClassesForFlow(flowKey);
    const className = classes[0]; // Use first class

    if (!className) {
      throw new Error(`No Weaviate class configured for ${flowKey} flow`);
    }

    // Get Weaviate fields for this flow
    const fields = getWeaviateFieldsForFlow(flowKey);

    // Build GraphQL query
    const graphqlQuery = buildWeaviateGraphQLQuery(
      className,
      embedding,
      limit,
      fields,
    );
    debug("GraphQL query (truncated):", graphqlQuery.substring(0, 1000));

    // Execute query
    const response = await fetch(`${WEAVIATE_CONFIG.url}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WEAVIATE_CONFIG.apiKey && {
          Authorization: `Bearer ${WEAVIATE_CONFIG.apiKey}`,
        }),
        ...(OPENAI_CONFIG.apiKey && {
          "X-OpenAI-Api-Key": OPENAI_CONFIG.apiKey,
        }),
      },
      body: JSON.stringify({ query: graphqlQuery }),
    });
    debug("Weaviate HTTP status:", response.status, response.statusText);
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "<no-body>");
      debug(
        "Weaviate error body:",
        bodyText.substring ? bodyText.substring(0, 2000) : bodyText,
      );
      throw new Error(`Weaviate query failed: ${response.statusText}`);
    }

    const data = await response.json();
    debugJson("weaviate.rawResponse", data);
    const documents = processWeaviateResults(data, scoreThreshold, className);
    const formatted = formatContextFromDocuments(documents);
    debugJson("weaviate.documents", documents.slice(0, 10));
    console.log(`✅ Retrieved ${documents.length} documents from Weaviate`);

    return {
      documents,
      formattedContext: formatted.context,
      citations: formatted.citations,
      totalRetrieved: documents.length,
    };
  } catch (error) {
    console.error("❌ Weaviate query failed:", error);
    debugJson("weaviate.error", {
      message: error?.message,
      stack: error?.stack,
    });
    throw error;
  }
}

function buildWeaviateGraphQLQuery(className, embedding, limit, fields) {
  return `
    {
      Get {
        ${className}(
          nearVector: {
            vector: [${embedding.join(", ")}]
          }
          limit: ${limit}
        ) {
          ${fields}
        }
      }
    }
  `;
}

const transformToCleanedKB = (results = []) => {
  return results.map((item) => ({
    caseNumber: item.caseNumber || "",
    caseTitle: item.caseTitle || "",
    caseType: item.caseType || "",
    caseDescription: item.caseDescription || "",
    solutionDescription: item.solutionDescription || "",
    instanceID: item.instanceID || "",
    certainty: item._additional?.certainty || 0,
  }));
};

function processWeaviateResults(data, scoreThreshold, className) {
  const results = data.data?.Get?.[Object.keys(data.data.Get)[0]] || [];

  if (className === "HRMixlangRAG") {
    return results
      .filter((item) => item._additional?.certainty >= scoreThreshold)
      .map((item, idx) => ({
        id: item.instanceID || `doc_${idx}`,
        content: item.documentDetail || "",
        title: item.requesterName || "Untitled",
        metadata: {
          description: item.documentDescription,
          email: item.requesterEmail,
          topic: item.documentTopic,
        },
        score: item._additional?.certainty || 0,
      }));
  } else if (className === "TORForPOC") {
    return results
      .filter((item) => item._additional?.score >= scoreThreshold)
      .map((item, idx) => ({
        id:
          item.instanceID ||
          item._additional?.id ||
          item.gdriveFileId ||
          `doc_${idx}`,
        content: item.documentDetail || "",
        title: item.documentTopic || "Untitled",
        metadata: {
          instanceID:
            item.instanceID ||
            item._additional?.id ||
            item.gdriveFileId ||
            null,
          description: item.documentDescription,
          page: item.documentPage,
          pageStart: item.documentPageStart,
          pageEnd: item.documentPageEnd,
          totalPages: item.totalPages,
          source: item.source,
          gdriveFileId: item.gdriveFileId,
          createdAt: item.createdAt,
        },
        score: item._additional?.score || 0,
      }));
  } else if (className === "CaseSolutionKnowledgeBase") {
    const cleanedResults = transformToCleanedKB(results);
    return cleanedResults
      .filter((item) => item.certainty >= scoreThreshold)
      .map((item, idx) => ({
        id: item.instanceID || item.caseNumber || `doc_${idx}`,
        content: item.solutionDescription || item.caseDescription || "",
        title: item.caseTitle || "Untitled",
        metadata: {
          caseNumber: item.caseNumber,
          caseType: item.caseType,
          caseDescription: item.caseDescription,
          solutionDescription: item.solutionDescription,
        },
        score: item.certainty,
      }));
  } else {
    return results
      .filter((item) => 1 - item._additional.distance >= scoreThreshold)
      .map((item, idx) => ({
        id: `doc_${idx}`,
        content: item.content || "",
        title: item.title || "Untitled",
        metadata: item.metadata || {},
        score: 1 - item._additional.distance,
      }));
  }
}

function formatContextFromDocuments(documents) {
  const citations = [];
  const context = documents
    .map((doc, idx) => {
      // Include instanceID/id so UI can open Kissflow popups
      const instanceId =
        doc.id || doc.metadata?.instanceID || doc.metadata?.caseNumber || null;
      citations.push({
        index: idx + 1,
        title: doc.title,
        source: "Weaviate",
        relevanceScore: doc.score,
        instanceID: instanceId,
        id: instanceId,
      });
      return `[${idx + 1}] ${doc.content.substring(0, 500)}...`;
    })
    .join("\n\n");

  return {
    context: context.substring(0, 3000),
    citations,
  };
}
