/**
 * KISSFLOW SERVICE MODULE
 * Handles all Kissflow SDK operations: Create, Read, Query, Update
 *
 * DECISION: REFACTOR from App.js
 * Moved sendKissflowCreateRequest and generalized for all flows
 */

import KFSDK from "@kissflow/lowcode-client-sdk";
import { getFlowConfig, isActionAllowedForFlow } from "../../config/flows";

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

    return result.data || [];
  } catch (error) {
    console.error("❌ Failed to fetch leave data:", error);
    throw error;
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

export async function openKissflowPopup(itemId) {
  try {
    const kf = await getKissflowSDK();
    if (!kf) {
      throw new Error("Kissflow SDK not initialized");
    }
    console.log(`📝 Opening Kissflow popup for item: ${itemId}`);
    // TODO: Implement popup opening
  } catch (error) {
    console.error("❌ Failed to open Kissflow popup:", error);
  }
}
