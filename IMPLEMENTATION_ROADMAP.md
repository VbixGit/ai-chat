#!/bin/bash

# IMPLEMENTATION ROADMAP

# High-priority TODOs and implementation checklist

# Last Updated: January 8, 2026

## CRITICAL PATH (Must Complete Before Production)

### 1. System Prompt Integration

**File:** src/App.js (lines ~48-50)
**Current:** Hardcoded placeholder
**Required:** Load from Kissflow Page variables at runtime

```javascript
// TODO: Load system prompt from Kissflow Page variables
// Pattern:
// const kf = await getKissflowSDK();
// const prompt = kf.app?.variables?.get('systemPrompt_' + selectedFlow);
// setSystemPrompt(prompt || defaultPrompt);
```

**Acceptance Criteria:**

- [ ] Prompt changes when user selects different flow
- [ ] Prompt persists across messages within same flow
- [ ] Graceful fallback if variable not found
- [ ] Prompt ID tracks in message metadata

---

### 2. Chat Completion Integration

**File:** src/App.js (lines ~66-90, sendMessage())
**Current:** Placeholder response "[Processing...]"
**Required:** Call OpenAI service with context

```javascript
// TODO: Replace placeholder with actual implementation
// 1. Detect language (DONE ✅)
// 2. Translate query to English if needed
// 3. Retrieve context from Weaviate
// 4. Call generateChatCompletion()
// 5. Translate response back to user language
// 6. Attach citations
```

**Example Implementation:**

```javascript
import { generateChatCompletion } from "./lib/services/openai";
import { queryWeaviate } from "./lib/services/weaviate";
import { translateToEnglishForRetrieval } from "./lib/services/languageDetection";

const chatResult = await generateChatCompletion({
  systemPrompt: systemPrompt,
  userMessage: input,
  chatHistory: getRecentMessages(messages),
  context: retrievedContext,
  temperature: 0.2,
});
```

**Acceptance Criteria:**

- [ ] Retrieves context from Weaviate
- [ ] Generates response using OpenAI
- [ ] Attaches citations
- [ ] Handles errors gracefully
- [ ] Respects message temperature (0.2 for deterministic)

---

### 3. Weaviate Retrieval Integration

**File:** src/lib/services/weaviate.ts (ready to use)
**Status:** Implemented ✅, ready for integration in sendMessage()

```javascript
// In sendMessage(), before chat completion:
const retrievalResult = await queryWeaviate({
  query: englishQuery, // translated if needed
  flowKey: selectedFlow,
  topK: 8,
  scoreThreshold: 0,
});

const { context, citations } = formatContextFromDocuments(
  retrievalResult.documents,
);
```

**Acceptance Criteria:**

- [ ] Fetches documents from flow-specific Weaviate class
- [ ] Filters by score threshold
- [ ] Limits to topK results
- [ ] Formats context for LLM
- [ ] Returns citations with document titles

---

### 4. Language Translation (Stubs Ready)

**Files:**

- src/lib/services/languageDetection.ts (lines 72-104)

**Current:** Returns original text with warning
**Required:** Integrate with OpenAI chat completions

```typescript
// In translateToEnglishForRetrieval():
export async function translateToEnglishForRetrieval(
  text: string,
  sourceLanguage: string,
): Promise<string> {
  if (sourceLanguage === "en") return text;

  // IMPLEMENT:
  const response = await generateChatCompletion({
    systemPrompt: `Translate the following ${sourceLanguage} text to English. Return ONLY the translation.`,
    userMessage: text,
  });

  return response.content;
}
```

**Acceptance Criteria:**

- [ ] Translates non-English queries to English
- [ ] Translates responses back to user language
- [ ] Preserves meaning and technical terms
- [ ] Performance < 2s per translation
- [ ] Falls back gracefully if unavailable

---

### 5. Suggested Questions per Flow

**File:** src/App.js (lines ~230-240)
**Current:** Disabled with "[Questions loading...]"
**Required:** Load from flow config or Kissflow

```javascript
// Add to flows.ts:
const HR_FLOW: FlowConfig = {
  // ... existing fields
  suggestedQuestions: [
    "What is our vacation policy?",
    "How do I request leave?",
    // ...
  ],
};

// In App.js sendMessage():
const flowConfig = FLOWS[selectedFlow];
const questions = flowConfig.suggestedQuestions || [];
```

**Acceptance Criteria:**

- [ ] Loads questions for current flow
- [ ] Each flow has 3-5 relevant questions
- [ ] Questions support multi-language
- [ ] Clicking question sets input field

---

## MEDIUM PRIORITY (Before Full Deployment)

### 6. UI Styling for New Components

**Files:** src/App.css

**Add CSS for:**

- [ ] .flow-selector (dropdown styling)
- [ ] .task-state (status display)
- [ ] .user-info (user details banner)
- [ ] .error-banner, .error-message (error states)
- [ ] .message-citations (source attribution)

**Reference:** Existing styles for consistency

---

### 7. Kissflow Dataset Query Integration

**File:** src/lib/services/kissflow.ts (ready to use)
**Example:** Leave balance query

```javascript
// In LEAVE flow, sendMessage():
const leaveData = await queryKissflowDataset(
  {
    datasetId: KISSFLOW_CONFIG.datasets.LEAVE_BALANCE,
    viewId: "leave_quota", // From flow config
    filters: { email: userInfo.email },
    limit: 1,
  },
  userInfo,
);

// Include in context:
const leaveContext = `User leave balance: ${leaveData[0].vacation} vacation days, ${leaveData[0].sick} sick days`;
```

**Acceptance Criteria:**

- [ ] Queries correct dataset per flow
- [ ] Filters by user email
- [ ] Returns structured data
- [ ] Handles empty results gracefully

---

### 8. Create Kissflow Item Integration

**File:** src/lib/services/kissflow.ts (ready to use)
**Example:** CRM case creation

```javascript
// Add button handler in App.js:
const handleCreateKissflowItem = async () => {
  const request: KissflowCreateRequest = {
    data: {
      Case_Title: "From AI Chat",
      Case_Description: lastAIResponse,
      // ... other fields
    },
    processId: KISSFLOW_CONFIG.processes.CRM,
  };

  const result = await createKissflowItem(request, selectedFlow, userInfo);
  await openKissflowPopup("popup_id", {
    instanceId: result._id,
    activityId: result._activity_instance_id,
  });
};
```

**Acceptance Criteria:**

- [ ] Submits to correct Kissflow process
- [ ] Opens form in popup for editing
- [ ] User can submit without leaving chat
- [ ] Returns created item ID

---

## LOW PRIORITY (Enhancements)

### 9. Backend Server.js Refactoring

**Current:** Legacy server with hardcoded logic
**Option A:** Remove entirely (migrate logic to frontend)
**Option B:** Refactor for multi-flow support

**If keeping server:**

- [ ] Update Weaviate class to be dynamic
- [ ] Use text-embedding-3-small
- [ ] Remove Kissflow case generation
- [ ] Add language detection
- [ ] Support allow-list for external DBs

---

### 10. Performance Optimizations

- [ ] Debounce language detection
- [ ] Cache Kissflow SDK instance
- [ ] Limit chat history to 10 messages
- [ ] Compress long context (summarize)
- [ ] Add request timeouts

---

### 11. Error Recovery & Retry Logic

- [ ] Retry failed Weaviate queries
- [ ] Retry failed OpenAI calls
- [ ] Graceful degradation if RAG unavailable
- [ ] User notification for transient errors
- [ ] Logging for debugging

---

## CONFIGURATION CHECKLIST

Before deployment, ensure .env is configured:

```bash
# .env.local or environment variables

# OpenAI ✅
REACT_APP_OPENAI_API_KEY=sk-...
REACT_APP_OPENAI_CHAT_MODEL=gpt-4o-mini
REACT_APP_OPENAI_EMBED_MODEL=text-embedding-3-small

# Weaviate ✅
REACT_APP_WEAVIATE_URL=https://...
REACT_APP_WEAVIATE_API_KEY=...
REACT_APP_WEAVIATE_CLASS_HR=...
REACT_APP_WEAVIATE_CLASS_TOR=...
REACT_APP_WEAVIATE_CLASS_CRM=...
REACT_APP_WEAVIATE_CLASS_LEAVE_POLICY=...

# Kissflow ✅
REACT_APP_KISSFLOW_DOMAIN=...
REACT_APP_KISSFLOW_ACCOUNT_ID=...
REACT_APP_KISSFLOW_APP_ID=...
REACT_APP_KISSFLOW_CRM_PROCESS_ID=...
REACT_APP_KISSFLOW_LEAVE_PROCESS_ID=...

# Kissflow Page Variables (Kissflow UI)
- systemPrompt_HR=...
- systemPrompt_TOR=...
- systemPrompt_CRM=...
- systemPrompt_LEAVE=...
```

---

## TESTING CHECKLIST

### Pre-Production Testing:

- [ ] All 4 flows tested (HR, TOR, CRM, Leave)
- [ ] Language detection working (test: th, en, ja, zh)
- [ ] Weaviate retrieval returning results
- [ ] OpenAI chat completion working
- [ ] Kissflow item creation successful
- [ ] Error handling & graceful degradation
- [ ] Dark mode toggle functional
- [ ] Task pause/resume working
- [ ] User info loading correctly
- [ ] System prompt loading from variables
- [ ] Message metadata complete on all messages

---

## DEPLOYMENT CHECKLIST

- [ ] All .env variables configured
- [ ] Kissflow Page variables set
- [ ] Weaviate classes created and populated
- [ ] OpenAI API key valid and funded
- [ ] Kissflow permissions configured
- [ ] Custom Component deployed to Kissflow
- [ ] Users can access from Custom Page
- [ ] Chat history resets on page refresh
- [ ] No console errors in production
- [ ] Performance acceptable (< 3s per message)

---

## DOCUMENTATION UPDATES

After implementation, update:

- [ ] User guide with flow selection UI
- [ ] Configuration guide with system prompt setup
- [ ] Error messages and troubleshooting
- [ ] API integration guide (for external DBs)
- [ ] Deployment instructions

---

## ESTIMATED TIMELINE

| Task                        | Priority | Est. Hours | Dependencies               |
| --------------------------- | -------- | ---------- | -------------------------- |
| System Prompt Integration   | CRITICAL | 2          | Kissflow access            |
| Chat Completion Integration | CRITICAL | 4          | OpenAI key, flows.ts       |
| Weaviate Integration        | CRITICAL | 3          | Weaviate instance          |
| Language Translation        | HIGH     | 3          | OpenAI, language detection |
| Suggested Questions         | HIGH     | 1          | Flow config                |
| UI Styling                  | MEDIUM   | 3          | Design system              |
| Dataset Queries             | MEDIUM   | 2          | Kissflow config            |
| Item Creation               | MEDIUM   | 2          | Kissflow setup             |
| Testing                     | HIGH     | 4          | All above                  |
| Deployment                  | HIGH     | 1          | All above                  |

**Total Estimated: 25-30 hours**

---

## NOTES & GOTCHAS

1. **TypeScript vs JavaScript:** Project uses .js files with config layer in .ts. Webpack should handle this. If issues, consider renaming App.js to App.tsx.

2. **Kissflow SDK Initialization:** Must run within Kissflow Custom Page. Won't work in standalone browser. Will show error on init if not in Kissflow.

3. **Weaviate GraphQL Schema:** Ensure schema includes `title`, `content`, `description` fields. If using different field names, update `buildWeaviateGraphQLQuery()`.

4. **Message History:** Limited to in-memory state for Phase 1. Chat will reset on page refresh (as designed). No persistence allowed.

5. **System Prompts:** Must be stored in Kissflow Page variables as:
   - `systemPrompt_HR`
   - `systemPrompt_TOR`
   - `systemPrompt_CRM`
   - `systemPrompt_LEAVE`

6. **Language Codes:** Currently supported: `th`, `en`, `ja`, `zh`, `es`, `fr`, `vi`. Add more languages to `LANGUAGE_PATTERNS` in languageDetection.ts.

---

**This roadmap provides a clear path to production deployment with quality assurance and documentation.**
