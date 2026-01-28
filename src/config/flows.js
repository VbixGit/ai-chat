/**
 * DECISION: Configuration-driven flow registry
 * Single source of truth for which flows exist and their capabilities
 * All flow-specific logic reads from this config
 */

export const FLOWS = {
  HR: {
    key: "HR",
    category: "HR",
    name: "Human Resources",
    description: "Organization and HR policy questions",
    dataSourcesAllowed: ["WEAVIATE"],
    weaviateClasses: ["HRMixlangRAG"],
    weaviateFields: `
      instanceID
      documentDetail
      requesterName
      documentDescription
      requesterEmail
      documentTopic
      _additional {
        certainty
      }
    `,
    kissflowProcessIds: [],
    actionsAllowed: ["ANSWER_ONLY"],
    requiresSystemPrompt: true,
    responseLanguage: "user-detected",
    kfPopupId: "Popup_XMI7PvxAKV",
    suggestedQuestions: [
      "What is our company vacation policy?",
      "How many sick days do employees get?",
    ],
  },
  TOR: {
    key: "TOR",
    category: "TOR",
    name: "Terms of Reference",
    description: "Terms of Reference and document search",
    dataSourcesAllowed: ["WEAVIATE"],
    weaviateClasses: ["TORForPOC"],
    weaviateFields: `
      instanceID
      documentTopic
      documentDescription
      documentDetail
      documentPage
      documentPageStart
      documentPageEnd
      totalPages
      source
      gdriveFileId
      createdAt
      _additional { score id }
    `,
    translateQueryToThai: true,
    kissflowProcessIds: [],
    actionsAllowed: ["ANSWER_ONLY"],
    requiresSystemPrompt: true,
    responseLanguage: "user-detected",
    kfPopupId: "Popup_tbzFztWnwg",
    suggestedQuestions: [
      "What are the project deliverables?",
      "What is the project timeline?",
    ],
  },
  CRM: {
    key: "CRM",
    category: "CRM",
    name: "Case Management",
    description: "Case management system with knowledge base",
    dataSourcesAllowed: ["WEAVIATE", "KISSFLOW"],
    weaviateClasses: ["CaseSolutionKnowledgeBase"],
    weaviateFields: `
      caseNumber
      caseTitle
      caseType
      caseDescription
      solutionDescription
      instanceID
      _additional {
        certainty
      }
    `,
    translateQueryToThai: true,
    kissflowProcessIds: ["CRM_PROCESS"],
    actionsAllowed: ["ANSWER_ONLY", "CREATE", "READ", "QUERY", "UPDATE"],
    requiresSystemPrompt: true,
    responseLanguage: "user-detected",
    systemPrompt: `คุณคือผู้ช่วยสนับสนุน (Support Assistant) สำหรับองค์กร
หน้าที่: วิเคราะห์ปัญหาของผู้ใช้และให้คำแนะนำการแก้ปัญหาโดยอ้างอิงจากฐานความรู้

【วิธีการตอบ】
1. อ่านประวัติการสนทนา (conversation history) เพื่อเข้าใจ context
2. ตรวจสอบ Knowledge Base - หากมีเคสคล้ายกัน ให้ใช้เป็นอ้างอิง
3. เขียน solution ที่เป็นคำแนะนำเชิงปฏิบัติ (actionable advice)
4. ห้ามเดา - ทั้งหมดต้องเป็นไทยเท่านั้น

【เงื่อนไข】
- Respond naturally like a human support agent
- Use conversation context to provide relevant solutions
- If similar cases exist → hasSimilarCase = true
- If no similar cases → hasSimilarCase = false, solution = "ยังไม่เคยพบเคสนี้ ไม่สามารถให้คำตอบได้"
- Never start with: "พบเคสที่คล้ายกัน", "จากข้อมูลใน KB", "อ้างอิงจากเคส"
- Output MUST be valid JSON immediately`,
    kfPopupId: "Popup_zZXcYR3X1n",
    caseSolutionSchema: {
      title: "CaseSolutionResponse",
      type: "object",
      properties: {
        hasSimilarCase: { type: "boolean" },
        solution: { type: "string" },
        referenceCaseTitle: {
          type: "array",
          items: {
            type: "object",
            properties: {
              caseNumber: { type: "string" },
              caseTitle: { type: "string" },
            },
            required: ["caseNumber", "caseTitle"],
            additionalProperties: false,
          },
        },
      },
      required: ["hasSimilarCase", "solution", "referenceCaseTitle"],
      additionalProperties: false,
    },
    kissflowFieldMapping: {
      Case_Title: "Case_Title",
      Case_Type: "Case_Type",
      Case_Description: "Case_Description",
      AI_Suggestions: "AI_Suggestions",
      Solution_Description: "Solution_Description",
      Requester_Email: "Requester_Email",
    },
    suggestedQuestions: ["อุปกรณ์พัง", "ระบบล่ม", "ปัญหาการเชื่อมต่อ"],
  },
  LEAVE: {
    key: "LEAVE",
    category: "Leave Request",
    name: "Leave Request",
    description: "Leave request handling and policy Q&A",
    dataSourcesAllowed: ["WEAVIATE", "KISSFLOW"],
    weaviateClasses: ["LeavePolicy"],
    kissflowProcessIds: ["Leave_Request_A57"],
    leaveDatasetId: "Process_With_AI_Chat_Leave_Request_Balan",
    leaveViewId: "leave_quota",
    leaveFields: {
      Vacation: "Vacation_Leave_Balance",
      Personal: "Personal_Leave_Balance",
      Sick: "Sick_Leave_Balance",
      Email: "Employee_Email",
    },
    kfPopupId: "Popup_gA1rZXfeUN",
    actionsAllowed: ["ANSWER_ONLY", "CREATE", "READ", "QUERY"],
    requiresSystemPrompt: true,
    responseLanguage: "user-detected",
    suggestedQuestions: [
      "How much leave do I have left?",
      "How do I request leave?",
      "What is the leave policy?",
    ],
  },
};

export function getFlowConfig(flowKey) {
  const flow = FLOWS[flowKey];
  if (!flow) {
    throw new Error(`Unknown flow: ${flowKey}`);
  }
  return flow;
}

export function isActionAllowedForFlow(flowKey, action) {
  try {
    const flow = getFlowConfig(flowKey);
    return flow.actionsAllowed.includes(action);
  } catch {
    return false;
  }
}

export function getWeaviateClassesForFlow(flowKey) {
  const flow = getFlowConfig(flowKey);
  return flow.weaviateClasses;
}

export function getWeaviateFieldsForFlow(flowKey) {
  const flow = getFlowConfig(flowKey);
  return (
    flow.weaviateFields ||
    `
    _additional {
      distance
    }
    content
    title
    metadata
  `
  );
}

export function getTranslateQueryToThaiForFlow(flowKey) {
  const flow = getFlowConfig(flowKey);
  return flow.translateQueryToThai || false;
}

export function getKissflowProcessIdsForFlow(flowKey) {
  const flow = getFlowConfig(flowKey);
  return flow.kissflowProcessIds.filter((id) => id);
}

export function listAvailableFlows() {
  return Object.values(FLOWS);
}

export function getSuggestedQuestionsForFlow(flowKey) {
  const flow = getFlowConfig(flowKey);
  return flow.suggestedQuestions || [];
}
