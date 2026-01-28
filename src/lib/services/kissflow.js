/**
 * KISSFLOW SERVICE MODULE
 * Handles all Kissflow SDK operations: Create, Read, Query, Update
 *
 * DECISION: REFACTOR from App.js
 * Moved sendKissflowCreateRequest and generalized for all flows
 */

import KFSDK from "@kissflow/lowcode-client-sdk";
import { getFlowConfig, isActionAllowedForFlow } from "../../config/flows";
import { generateChatCompletion } from "./openai";

let kfSDKInstance = null;

export async function isOpenedInKissflow() {
  try {
    // Check if Kissflow SDK is available in window
    if (typeof window !== "undefined" && window.KFSDK) {
      console.log("✅ Opened in Kissflow (SDK detected)");
      return true;
    }

    // Try to initialize SDK
    const kf = await getKissflowSDK();
    if (kf && kf.app && kf.app.page) {
      console.log("✅ Opened in Kissflow (SDK initialized successfully)");
      return true;
    }

    console.log("ℹ️ Opened in regular browser (Kissflow SDK not available)");
    return false;
  } catch (error) {
    console.log("ℹ️ Opened in regular browser (Kissflow SDK unavailable)");
    return false;
  }
}

export async function getKissflowSDK() {
  if (!kfSDKInstance) {
    try {
      kfSDKInstance = await KFSDK.initialize();
    } catch (err) {
      console.warn("⚠️ Kissflow SDK initialization failed:", err.message);
      kfSDKInstance = null;
    }
  }
  return kfSDKInstance;
}

export async function getUserInfoFromKissflow() {
  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      throw new Error("Kissflow SDK not initialized");
    }

    const { Name, Email, _id } = kf.user || {};

    if (!_id) {
      throw new Error("User information not available");
    }

    return {
      userId: _id,
      accountId: kf.account._id,
      name: Name,
      email: Email,
      loadedAt: Date.now(),
    };
  } catch (error) {
    console.error("❌ Failed to get user info:", error);
    throw error;
  }
}

export function validateActionForFlow(flowKey, action) {
  if (!isActionAllowedForFlow(flowKey, action)) {
    throw new Error(`Action '${action}' not allowed for flow '${flowKey}'`);
  }
}

export async function createKissflowItem(request, flowKey, userInfo) {
  validateActionForFlow(flowKey, "CREATE");

  const flow = getFlowConfig(flowKey);
  const processId = flow.kissflowProcessIds[0];

  if (!processId) {
    throw new Error(`No Kissflow process configured for ${flowKey} flow`);
  }

  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      throw new Error("Kissflow SDK not initialized");
    }

    console.log(`📤 Creating Kissflow item in ${flowKey}...`);

    const processName = processId;
    const apiEndpoint = `/process/2/${userInfo.accountId}/${processName}/create/submit`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request.data || {}),
    };

    const result = await kf.api(apiEndpoint, options);

    return {
      id: result.id || `item_${Date.now()}`,
      flowKey,
      created: true,
      result,
    };
  } catch (error) {
    console.error(`❌ Failed to create Kissflow item:`, error);
    throw error;
  }
}

export async function queryKissflowDataset(datasetQuery, userInfo) {
  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      throw new Error("Kissflow SDK not initialized");
    }

    console.log(`📊 Querying Kissflow dataset...`);

    // TODO: Implement actual dataset query
    console.log("🔄 TODO: Implement Kissflow dataset query");

    return {
      items: [],
      totalCount: 0,
      hasMore: false,
    };
  } catch (error) {
    console.error("❌ Failed to query Kissflow dataset:", error);
    throw error;
  }
}

export async function fetchUserLeaveData(email) {
  try {
    const userInfo = await getUserInfoFromKissflow();
    const { accountId } = userInfo;
    const flow = getFlowConfig("LEAVE");
    const datasetId = flow.leaveDatasetId;
    const viewId = flow.leaveViewId;
    const emailField = flow.leaveFields.Email;

    const kf = await getKissflowSDK();
    if (!kf) {
      throw new Error("Kissflow SDK not initialized");
    }

    const endpoint = `/dataset/2/${accountId}/${datasetId}/view/${viewId}/list?q=${email}&page_number=1&page_size=10&search_field=${emailField}`;
    const options = {
      method: "GET",
    };

    console.log(`📊 Fetching leave data for ${email}...`);
    const result = await kf.api(endpoint, options);
    console.log("✅ Leave data fetched");

    // Normalize response: some KF endpoints return `Data` or `data`
    return result.Data || result.data || [];
  } catch (error) {
    console.error("❌ Failed to fetch leave data:", error);
    throw error;
  }
}

/**
 * Generate an answer using OpenAI with provided context
 */
export async function generateAnswerFromOpenAI(
  context,
  question,
  chatHistory = [],
) {
  try {
    const prompt = `${context}\n\nUser question:\n${question}`;
    const response = await generateChatCompletion({
      systemPrompt:
        "You are a helpful assistant that answers queries about employee leave balances and policies. Reply concisely in the user's language.",
      userMessage: prompt,
      chatHistory: chatHistory || [],
      context: "",
    });
    return response.content || "";
  } catch (err) {
    console.error("❌ generateAnswerFromOpenAI failed:", err);
    throw err;
  }
}

/**
 * Handle a leave-related question: fetch user leave data and ask OpenAI to answer
 */
export async function handleQuestion(question, chatHistory = []) {
  try {
    // Get current user info
    const userInfo = await getUserInfoFromKissflow();
    if (!userInfo || !userInfo.email) {
      return {
        text: "ไม่สามารถดึงข้อมูล Email ของคุณได้ กรุณาตรวจสอบการเข้าสู่ระบบ Kissflow",
        sender: "ai",
        role: "assistant",
        knowledgeBase: [],
        kissflowData: null,
      };
    }

    // Fetch leave data
    const leaveDataList = await fetchUserLeaveData(userInfo.email);

    // Find the record that matches the email exactly (double check)
    const flow = getFlowConfig("LEAVE");
    const emailField = flow.leaveFields?.Email;

    const userRecord =
      (Array.isArray(leaveDataList) &&
        leaveDataList.find((item) => item[emailField] === userInfo.email)) ||
      (Array.isArray(leaveDataList) ? leaveDataList[0] : null);

    if (!userRecord) {
      return {
        text: `ไม่พบข้อมูลวันลาสำหรับ Email: ${userInfo.email}`,
        sender: "ai",
        role: "assistant",
        knowledgeBase: [],
        kissflowData: null,
      };
    }

    // Extract balances
    const vacation = userRecord[flow.leaveFields?.Vacation] || 0;
    const personal = userRecord[flow.leaveFields?.Personal] || 0;
    const sick = userRecord[flow.leaveFields?.Sick] || 0;

    // Build context for AI
    const context = `ข้อมูลวันลาคงเหลือของพนักงาน:\n- ลาพักร้อน: ${vacation} วัน\n- ลากิจ: ${personal} วัน\n- ลาป่วย: ${sick} วัน`;

    // Generate answer using AI
    const answer = await generateAnswerFromOpenAI(
      context,
      question,
      chatHistory,
    );

    return {
      text: answer,
      sender: "ai",
      role: "assistant",
      knowledgeBase: [],
      kissflowData: userRecord,
      showCreateButton: true,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return {
      text: `เกิดข้อผิดพลาดในการดึงข้อมูล: ${msg}`,
      sender: "ai",
      role: "assistant",
      knowledgeBase: [],
      showCreateButton: false,
    };
  }
}

export async function validateKissflowAvailability() {
  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      return {
        available: false,
        error: "Kissflow SDK not initialized",
      };
    }
    return {
      available: true,
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      error: error.message || "Kissflow validation failed",
    };
  }
}

export async function getFlowFromPageVariables() {
  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      throw new Error("Kissflow SDK not initialized");
    }

    // Get all parameters from Kissflow page
    const allParameters = await kf.app.page.getAllParameters();
    console.log("📄 Kissflow page parameters:", allParameters);

    // Get flow from parameters (process_name or flowKey)
    const flowKey =
      allParameters?.flow ||
      allParameters?.flowKey ||
      allParameters?.selectedFlow ||
      allParameters?.FLOW ||
      window.gv?.flow ||
      window.gv?.flowKey;

    if (!flowKey) {
      console.warn("⚠️ No flow found in page parameters, using default LEAVE");
      return "LEAVE"; // Default fallback
    }

    console.log(`✅ Flow from page parameters: ${flowKey}`);
    return flowKey;
  } catch (error) {
    console.error("❌ Failed to get flow from page parameters:", error);
    return "LEAVE"; // Default fallback
  }
}

export async function getSystemPromptFromPageVariables() {
  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      console.warn("⚠️ Kissflow SDK not initialized");
      return null;
    }

    // Get system prompt from Kissflow page variable
    const systemPrompt = await kf.app.page.getVariable("system_prompt");

    if (systemPrompt) {
      console.log("✅ System prompt from page variable loaded:", systemPrompt);
      return systemPrompt;
    }

    return null;
  } catch (error) {
    console.error("❌ Failed to get system prompt from page variable:", error);
    return null;
  }
}

export async function getProcessNameFromPageVariables() {
  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      console.warn("⚠️ Kissflow SDK not initialized for process_name");
      return null;
    }

    // Get process name from Kissflow page variable
    console.log("🔍 Fetching process_name from Kissflow page variable...");
    const processName = await kf.app.page.getVariable("process_name");
    console.log("📊 process_name value:", processName);

    if (processName) {
      console.log(`✅ Process name from page variable: ${processName}`);
      return processName;
    }

    console.warn("⚠️ process_name is empty/undefined from page variable");
    return null;
  } catch (error) {
    console.error(
      "❌ Failed to get process name from page variable:",
      error.message,
    );
    return null;
  }
}

export async function openKissflowPopup(
  popupId,
  instanceIds = [],
  flowKey = null,
) {
  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      throw new Error("Kissflow SDK not initialized");
    }

    const ids = (instanceIds || [])
      .map((s) => (s || "").toString().trim())
      .filter(Boolean);
    if (!ids.length) {
      console.warn("⚠️ openKissflowPopup called with no instance IDs");
      return;
    }

    const joined = ids.join(",");
    const paramName =
      flowKey === "HR" || flowKey === "TOR" ? "instanceidreport" : "ids";
    const queryParams = { [paramName]: joined };

    console.log(
      `📝 Opening Kissflow popup '${popupId}' for flow '${flowKey}' with params:`,
      queryParams,
    );

    // Strategy 1: use SDK popup API if available
    if (kf.app && kf.app.popup && typeof kf.app.popup.open === "function") {
      try {
        await kf.app.popup.open(popupId, { queryParams });
        console.log("✅ Popup opened via kf.app.popup.open");
        return;
      } catch (err) {
        console.warn("⚠️ kf.app.popup.open failed:", err.message || err);
      }
    }

    // Strategy 2: use page.openPopup if available
    if (kf.app && kf.app.page && typeof kf.app.page.openPopup === "function") {
      try {
        await kf.app.page.openPopup(popupId, { queryParams });
        console.log("✅ Popup opened via kf.app.page.openPopup");
        return;
      } catch (err) {
        console.warn("⚠️ kf.app.page.openPopup failed:", err.message || err);
      }
    }

    // Strategy 3: fallback to constructing a URL and opening a new window/tab
    try {
      const base =
        typeof window !== "undefined" &&
        window.location &&
        window.location.origin
          ? window.location.origin
          : "";
      const url = `${base}?popup=${encodeURIComponent(popupId)}&${encodeURIComponent(paramName)}=${encodeURIComponent(joined)}`;
      if (typeof window !== "undefined" && window.open) {
        window.open(url, "_blank");
        console.log("✅ Popup opened via window.open fallback", url);
        return;
      }
    } catch (err) {
      console.warn("⚠️ Fallback window.open failed:", err.message || err);
    }

    console.error(
      "❌ Unable to open Kissflow popup: no available method succeeded",
    );
  } catch (error) {
    console.error("❌ Failed to open Kissflow popup:", error);
  }
}

// Return the query parameter name used for popup calls for a given flow
export function getPopupParamNameForFlow(flowKey) {
  return flowKey === "HR" || flowKey === "TOR" ? "instanceidreport" : "ids";
}

// Lightweight integration check that validates SDK initialization and popup APIs
// This is non-destructive and will NOT open any UI. Use in diagnostics.
export async function testKissflowIntegration(
  flowKey = null,
  sampleInstanceIds = [],
) {
  try {
    const kf = await getKissflowSDK();
    const sdkInitialized = !!kf;

    const popupApiAvailable = !!(
      kf &&
      ((kf.app && kf.app.popup && typeof kf.app.popup.open === "function") ||
        (kf.app && kf.app.page && typeof kf.app.page.openPopup === "function"))
    );

    const popupId = (() => {
      try {
        if (!flowKey) return null;
        const flow = getFlowConfig(flowKey);
        return flow?.kfPopupId || null;
      } catch (e) {
        return null;
      }
    })();

    const paramName = getPopupParamNameForFlow(flowKey || "");

    return {
      sdkInitialized,
      popupApiAvailable,
      popupId,
      paramName,
      sampleInstanceIds: (sampleInstanceIds || []).slice(0, 10),
      message: sdkInitialized
        ? popupApiAvailable
          ? "Kissflow SDK initialized and popup API appears available"
          : "Kissflow SDK initialized but popup API not detected"
        : "Kissflow SDK not initialized",
    };
  } catch (error) {
    return {
      sdkInitialized: false,
      popupApiAvailable: false,
      popupId: null,
      paramName: getPopupParamNameForFlow(flowKey || ""),
      sampleInstanceIds: (sampleInstanceIds || []).slice(0, 10),
      message: `Error during integration test: ${error?.message || String(error)}`,
      error: error?.message || String(error),
    };
  }
}
