// openLesson OpenClaw Plugin v2.0.0
// Full coverage of the openLesson Agentic API v2 (28 endpoints)

interface JsonObject {
  [key: string]: unknown;
}

interface AgentToolContext {
  channel?: string;
  senderId?: string;
}

interface PluginConfig {
  apiKey: string;
  baseUrl: string;
}

type ToolHandler = (ctx: AgentToolContext, params: JsonObject) => Promise<JsonObject>;

interface PluginApi {
  registerTool: (tool: JsonObject, handler: ToolHandler) => void;
  config: JsonObject;
  logger: { error: (msg: string) => void };
}

function getConfig(api: PluginApi): PluginConfig {
  const cfg = api.config as {
    plugins?: {
      entries?: {
        "open-lesson"?: { config?: { apiKey?: string; baseUrl?: string } };
      };
    };
  };
  const pluginConfig = cfg.plugins?.entries?.["open-lesson"]?.config;
  return {
    apiKey: pluginConfig?.apiKey || process.env.OPENLESSON_API_KEY || "",
    baseUrl:
      pluginConfig?.baseUrl || "https://www.openlesson.academy",
  };
}

function requireApiKey(config: PluginConfig): void {
  if (!config.apiKey) {
    throw new Error(
      "API key not configured. Set OPENLESSON_API_KEY or configure via plugins.entries.open-lesson.config.apiKey"
    );
  }
}

async function makeRequest(
  api: PluginApi,
  config: PluginConfig,
  path: string,
  method: string,
  options?: { body?: JsonObject; query?: Record<string, string | undefined> }
): Promise<JsonObject> {
  const base = `${config.baseUrl}/api/v2/agent`;
  const url = new URL(`${base}${path}`);

  if (options?.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && v !== "") {
        url.searchParams.set(k, v);
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return (await response.json()) as JsonObject;
  } catch (error) {
    api.logger.error(`openLesson API error: ${error}`);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Tool registration helper
// ---------------------------------------------------------------------------

function tool(
  api: PluginApi,
  id: string,
  name: string,
  description: string,
  inputSchema: JsonObject,
  handler: ToolHandler
): void {
  api.registerTool({ id, name, description, inputSchema }, handler);
}

// ===========================================================================
// PLUGIN ENTRY POINT
// ===========================================================================

export default function (api: PluginApi) {
  // =========================================================================
  // API KEYS (4 tools) — session-cookie auth, included for full coverage
  // =========================================================================

  tool(
    api,
    "list_api_keys",
    "List API Keys",
    "List all API keys for the authenticated user. Returns key metadata (not the secret key itself). Note: this endpoint uses session cookie auth.",
    {
      type: "object",
      properties: {},
    },
    async () => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/keys", "GET");
    }
  );

  tool(
    api,
    "create_api_key",
    "Create API Key",
    "Create a new API key. The secret key is returned only once at creation time. Requires an active Pro subscription. Note: this endpoint uses session cookie auth.",
    {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "Human-readable label for the key (max 128 chars)",
        },
        scopes: {
          type: "array",
          items: { type: "string" },
          description:
            'Permission scopes. Valid: "*", "plans:read", "plans:write", "sessions:read", "sessions:write", "analysis:write", "assistant:read", "analytics:read", "proofs:read", "proofs:anchor". Default: ["*"]',
        },
        expires_in_days: {
          type: "number",
          description: "Key expiry in days (1-365). Omit for no expiry.",
          minimum: 1,
          maximum: 365,
        },
      },
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/keys", "POST", { body: params });
    }
  );

  tool(
    api,
    "revoke_api_key",
    "Revoke API Key",
    "Revoke (soft-delete) an API key by its ID. The key will no longer be usable for authentication. Note: this endpoint uses session cookie auth.",
    {
      type: "object",
      properties: {
        key_id: {
          type: "string",
          description: "UUID of the API key to revoke",
        },
      },
      required: ["key_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/keys/${params.key_id}`,
        "DELETE"
      );
    }
  );

  tool(
    api,
    "update_key_scopes",
    "Update Key Scopes",
    "Update the permission scopes on an existing API key. Note: this endpoint uses session cookie auth.",
    {
      type: "object",
      properties: {
        key_id: {
          type: "string",
          description: "UUID of the API key to update",
        },
        scopes: {
          type: "array",
          items: { type: "string" },
          description:
            'New scopes to set. Valid: "*", "plans:read", "plans:write", "sessions:read", "sessions:write", "analysis:write", "assistant:read", "analytics:read", "proofs:read", "proofs:anchor"',
        },
      },
      required: ["key_id", "scopes"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/keys/${params.key_id}/scopes`,
        "PATCH",
        { body: { scopes: params.scopes } }
      );
    }
  );

  // =========================================================================
  // LEARNING PLANS (8 tools)
  // =========================================================================

  tool(
    api,
    "list_plans",
    "List Learning Plans",
    "List learning plans for the authenticated user with pagination. Filter by status (active, paused, completed, archived).",
    {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "paused", "completed", "archived"],
          description: "Filter by plan status",
        },
        limit: {
          type: "number",
          description: "Number of plans to return (1-100, default 20)",
          minimum: 1,
          maximum: 100,
        },
        offset: {
          type: "number",
          description: "Pagination offset (default 0)",
          minimum: 0,
        },
      },
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/plans", "GET", {
        query: {
          status: params.status as string | undefined,
          limit: params.limit !== undefined ? String(params.limit) : undefined,
          offset:
            params.offset !== undefined ? String(params.offset) : undefined,
        },
      });
    }
  );

  tool(
    api,
    "create_plan",
    "Create Learning Plan",
    "Generate a personalized learning plan as a directed graph of tutoring sessions for a given topic. Uses AI to create an optimal learning path.",
    {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The topic to create a learning plan for",
        },
        duration_days: {
          type: "number",
          description:
            "Number of days to spread the plan across (default 30). Common values: 7, 14, 30, 60, 90, 180",
          minimum: 1,
        },
        difficulty: {
          type: "string",
          description:
            "Difficulty level context for the AI (e.g. 'beginner', 'intermediate', 'advanced')",
        },
        description: {
          type: "string",
          description: "Additional description or context for the plan",
        },
        source_materials: {
          type: "string",
          description: "Source materials context for the AI",
        },
        user_context: {
          type: "string",
          description:
            "User context for the AI (e.g. prior knowledge, learning goals)",
        },
      },
      required: ["topic"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/plans", "POST", {
        body: params,
      });
    }
  );

  tool(
    api,
    "get_plan",
    "Get Learning Plan",
    "Get a learning plan by ID with all nodes and progress statistics (total, completed, available, in-progress nodes and progress percentage).",
    {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "UUID of the learning plan",
        },
      },
      required: ["plan_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/plans/${params.plan_id}`,
        "GET"
      );
    }
  );

  tool(
    api,
    "update_plan",
    "Update Learning Plan",
    "Update a learning plan's metadata (title, notes, status). Only the provided fields are updated.",
    {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "UUID of the learning plan to update",
        },
        title: {
          type: "string",
          description: "New title for the plan",
        },
        notes: {
          type: ["string", "null"],
          description: "New notes (or null to clear)",
        },
        status: {
          type: "string",
          enum: ["active", "paused", "completed", "archived"],
          description: "New status for the plan",
        },
      },
      required: ["plan_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      const { plan_id, ...body } = params;
      return await makeRequest(api, config, `/plans/${plan_id}`, "PATCH", {
        body,
      });
    }
  );

  tool(
    api,
    "delete_plan",
    "Delete Learning Plan",
    "Delete a learning plan and all its nodes. Sessions linked to the plan will be unlinked but not deleted.",
    {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "UUID of the learning plan to delete",
        },
      },
      required: ["plan_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/plans/${params.plan_id}`,
        "DELETE"
      );
    }
  );

  tool(
    api,
    "get_plan_nodes",
    "Get Plan Nodes",
    "Get all nodes for a learning plan with edges and graph information (start nodes, leaf nodes, edge list). Useful for visualizing the learning path.",
    {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "UUID of the learning plan",
        },
      },
      required: ["plan_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/plans/${params.plan_id}/nodes`,
        "GET"
      );
    }
  );

  tool(
    api,
    "adapt_plan",
    "Adapt Learning Plan",
    "AI-powered plan adaptation. Provide a natural language instruction to modify the learning plan (add, remove, reorder, or update nodes). Completed nodes are preserved by default.",
    {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "UUID of the learning plan to adapt",
        },
        instruction: {
          type: "string",
          description:
            "Natural language instruction for how to adapt the plan (e.g. 'Add more exercises on recursion', 'Remove the database section')",
        },
        preserve_completed: {
          type: "boolean",
          description:
            "Whether to preserve completed nodes from modification or deletion (default true)",
        },
        context: {
          type: "string",
          description: "Additional context for the AI adaptation",
        },
      },
      required: ["plan_id", "instruction"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      const { plan_id, ...body } = params;
      return await makeRequest(
        api,
        config,
        `/plans/${plan_id}/adapt`,
        "POST",
        { body }
      );
    }
  );

  tool(
    api,
    "create_plan_from_video",
    "Create Plan from YouTube Video",
    "Create a learning plan from a YouTube video. The AI analyzes the video content and generates a structured learning path based on it.",
    {
      type: "object",
      properties: {
        youtube_url: {
          type: "string",
          description:
            "YouTube video URL (supports youtube.com/watch?v=, youtu.be/, youtube.com/embed/ formats)",
        },
        duration_days: {
          type: "number",
          description:
            "Number of days to spread the plan across (default 30)",
          minimum: 1,
        },
        focus_areas: {
          type: "string",
          description: "Specific areas to focus on from the video",
        },
        user_context: {
          type: "string",
          description: "User context (prior knowledge, goals)",
        },
      },
      required: ["youtube_url"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/plans/from-video", "POST", {
        body: params,
      });
    }
  );

  // =========================================================================
  // SESSIONS (11 tools)
  // =========================================================================

  tool(
    api,
    "list_sessions",
    "List Sessions",
    "List tutoring sessions with pagination. Filter by status or plan ID.",
    {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by session status (e.g. active, paused, completed)",
        },
        plan_id: {
          type: "string",
          description: "Filter by learning plan ID",
        },
        limit: {
          type: "number",
          description: "Number of sessions to return (1-100, default 20)",
          minimum: 1,
          maximum: 100,
        },
        offset: {
          type: "number",
          description: "Pagination offset (default 0)",
          minimum: 0,
        },
      },
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/sessions", "GET", {
        query: {
          status: params.status as string | undefined,
          plan_id: params.plan_id as string | undefined,
          limit: params.limit !== undefined ? String(params.limit) : undefined,
          offset:
            params.offset !== undefined ? String(params.offset) : undefined,
        },
      });
    }
  );

  tool(
    api,
    "start_session",
    "Start Session",
    "Start a new guided tutoring session. Can be standalone or linked to a learning plan node. Returns session details, an AI-generated session plan with steps, and an opening probe question.",
    {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The topic or problem to explore in this session",
        },
        plan_id: {
          type: "string",
          description: "Optional learning plan ID to link this session to",
        },
        plan_node_id: {
          type: "string",
          description:
            "Optional plan node ID to link this session to a specific node in the plan",
        },
        tutoring_language: {
          type: "string",
          description:
            "Language code for tutoring (e.g. 'en', 'es', 'fr')",
        },
        metadata: {
          type: "object",
          description: "Arbitrary extra metadata to attach to the session",
        },
      },
      required: ["topic"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/sessions", "POST", {
        body: params,
      });
    }
  );

  tool(
    api,
    "get_session",
    "Get Session",
    "Get detailed session information including the session plan, statistics (probes, gap scores, transcript stats), and active probes.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/sessions/${params.session_id}`,
        "GET"
      );
    }
  );

  tool(
    api,
    "analyze_session",
    "Analyze Session (Multimodal)",
    "Submit inputs for analysis during a session. Supports multimodal input: audio (base64 webm/mp4/ogg), text, and images. Returns gap analysis, session plan updates, and guidance with next probe. This is the main heartbeat endpoint during a tutoring session.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the active session",
        },
        inputs: {
          type: "array",
          description:
            'Array of input objects. Each must have a "type" field: "audio" (with data, format, optional duration_ms), "text" (with content), or "image" (with data, mime_type)',
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["audio", "text", "image"],
                description: "Input type",
              },
              data: {
                type: "string",
                description:
                  "Base64-encoded data (for audio and image types)",
              },
              format: {
                type: "string",
                description: 'Audio format: "webm", "mp4", or "ogg"',
              },
              duration_ms: {
                type: "number",
                description: "Audio duration in milliseconds (optional)",
              },
              content: {
                type: "string",
                description: "Text content (for text type)",
              },
              mime_type: {
                type: "string",
                description: "Image MIME type (for image type)",
              },
            },
            required: ["type"],
          },
        },
        context: {
          type: "object",
          description:
            "Optional context object with active_probe_ids, focused_probe_id, tools_in_use, user_actions_since_last",
          properties: {
            active_probe_ids: {
              type: "array",
              items: { type: "string" },
              description: "IDs of currently active probes",
            },
            focused_probe_id: {
              type: "string",
              description: "ID of the currently focused probe",
            },
            tools_in_use: {
              type: "array",
              items: { type: "string" },
              description: "Tools the user is currently using",
            },
            user_actions_since_last: {
              type: "array",
              items: { type: "object" },
              description:
                "Actions taken since last analysis (tool, action, timestamp, data)",
            },
          },
        },
      },
      required: ["session_id", "inputs"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      const { session_id, ...body } = params;
      return await makeRequest(
        api,
        config,
        `/sessions/${session_id}/analyze`,
        "POST",
        { body }
      );
    }
  );

  tool(
    api,
    "pause_session",
    "Pause Session",
    "Pause an active tutoring session. Records elapsed time. Can only pause sessions that are currently active.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session to pause",
        },
        reason: {
          type: "string",
          description: "Reason for pausing the session",
        },
        estimated_resume_minutes: {
          type: "number",
          description: "Estimated minutes until resume",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      const { session_id, ...body } = params;
      return await makeRequest(
        api,
        config,
        `/sessions/${session_id}/pause`,
        "POST",
        { body }
      );
    }
  );

  tool(
    api,
    "resume_session",
    "Resume Session",
    "Resume a paused tutoring session. Returns a reorientation probe to help the user get back on track, along with current session context (plan progress, active probes, pause duration).",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session to resume",
        },
        continuation_context: {
          type: "string",
          description:
            "Optional context about what happened during the pause or what the user wants to focus on",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      const { session_id, ...body } = params;
      return await makeRequest(
        api,
        config,
        `/sessions/${session_id}/resume`,
        "POST",
        { body }
      );
    }
  );

  tool(
    api,
    "restart_session",
    "Restart Session",
    "Restart a tutoring session with a fresh session plan and opening probe. Archives all existing probes. Optionally preserves the transcript and provides a new tutoring strategy.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session to restart",
        },
        reason: {
          type: "string",
          description: "Reason for restarting the session",
        },
        preserve_transcript: {
          type: "boolean",
          description:
            "Whether to keep the existing transcript (default false — transcript is cleared)",
        },
        new_strategy: {
          type: "string",
          description:
            "New tutoring strategy to use for the restarted session",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      const { session_id, ...body } = params;
      return await makeRequest(
        api,
        config,
        `/sessions/${session_id}/restart`,
        "POST",
        { body }
      );
    }
  );

  tool(
    api,
    "end_session",
    "End Session",
    "End a tutoring session and generate a summary report. Computes statistics (duration, probes, gap scores, word count). If the session has sufficient audio (>= 50 words), generates a full AI report. Also creates a session batch proof.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session to end",
        },
        completion_status: {
          type: "string",
          description:
            'Completion status (default "completed")',
        },
        user_feedback: {
          type: "string",
          description: "Optional user feedback about the session",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      const { session_id, ...body } = params;
      return await makeRequest(
        api,
        config,
        `/sessions/${session_id}/end`,
        "POST",
        { body }
      );
    }
  );

  tool(
    api,
    "list_session_probes",
    "List Session Probes",
    "List probes (questions/assessments) for a session. Filter by status: active, archived, or all.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session",
        },
        status: {
          type: "string",
          enum: ["active", "archived", "all"],
          description: "Filter probes by status (default: all)",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/sessions/${params.session_id}/probes`,
        "GET",
        {
          query: {
            status: params.status as string | undefined,
          },
        }
      );
    }
  );

  tool(
    api,
    "get_session_plan",
    "Get Session Plan",
    "Get the tutoring plan for a session, including all steps with their status and step-level statistics (total, pending, in-progress, completed, skipped).",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/sessions/${params.session_id}/plan`,
        "GET"
      );
    }
  );

  tool(
    api,
    "get_session_transcript",
    "Get Session Transcript",
    'Get the transcript for a session. Supports three formats: "full" (all chunks with text), "summary" (first 5 + last 5 sentences), "chunks" (metadata only, no text). Use since_ms to get only chunks after a timestamp.',
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session",
        },
        format: {
          type: "string",
          enum: ["full", "summary", "chunks"],
          description: 'Transcript format (default: "full")',
        },
        since_ms: {
          type: "number",
          description:
            "Only return chunks with timestamp_ms >= this value (default 0)",
          minimum: 0,
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/sessions/${params.session_id}/transcript`,
        "GET",
        {
          query: {
            format: params.format as string | undefined,
            since_ms:
              params.since_ms !== undefined
                ? String(params.since_ms)
                : undefined,
          },
        }
      );
    }
  );

  // =========================================================================
  // TEACHING ASSISTANT (2 tools)
  // =========================================================================

  tool(
    api,
    "ask_assistant",
    "Ask Teaching Assistant",
    "Ask a question to the teaching assistant within a session context. The assistant provides Socratic guidance without giving away answers. Supports multi-turn conversations via conversation_id.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session",
        },
        question: {
          type: "string",
          description: "The question to ask (max 5000 characters)",
        },
        context: {
          type: "object",
          description: "Optional context",
          properties: {
            relevant_probe_ids: {
              type: "array",
              items: { type: "string" },
              description: "IDs of relevant probes for context",
            },
            user_confusion_level: {
              type: "number",
              description: "How confused the user is (0-1)",
            },
            what_user_already_tried: {
              type: "string",
              description: "What the user has already attempted",
            },
          },
        },
        conversation_id: {
          type: "string",
          description:
            "ID of an existing conversation to continue. Omit to start a new conversation.",
        },
      },
      required: ["session_id", "question"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      const { session_id, ...body } = params;
      return await makeRequest(
        api,
        config,
        `/sessions/${session_id}/ask`,
        "POST",
        { body }
      );
    }
  );

  tool(
    api,
    "get_assistant_conversation",
    "Get Assistant Conversation",
    "Retrieve the full message history of a teaching assistant conversation within a session.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session",
        },
        conversation_id: {
          type: "string",
          description: "UUID of the conversation",
        },
      },
      required: ["session_id", "conversation_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/sessions/${params.session_id}/assistant/conversations/${params.conversation_id}`,
        "GET"
      );
    }
  );

  // =========================================================================
  // ANALYTICS (3 tools)
  // =========================================================================

  tool(
    api,
    "get_plan_analytics",
    "Get Plan Analytics",
    "Get comprehensive analytics for a learning plan: progress, session stats, performance trends, strongest/weakest topics, per-node detail, and AI-generated recommendations.",
    {
      type: "object",
      properties: {
        plan_id: {
          type: "string",
          description: "UUID of the learning plan",
        },
      },
      required: ["plan_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/analytics/plans/${params.plan_id}`,
        "GET"
      );
    }
  );

  tool(
    api,
    "get_session_analytics",
    "Get Session Analytics",
    "Get detailed analytics for a session: probe breakdown by type, gap score timeline, plan progress, transcript stats, and the session report.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/analytics/sessions/${params.session_id}`,
        "GET"
      );
    }
  );

  tool(
    api,
    "get_user_analytics",
    "Get User Analytics",
    "Get user-wide analytics dashboard: overview (plans, sessions, completion rates, total time), performance trends (gap scores, improving/declining/stable), learning history (recent topics, time per topic), and achievements (streaks, totals).",
    {
      type: "object",
      properties: {},
    },
    async () => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/analytics/user", "GET");
    }
  );

  // =========================================================================
  // PROOFS (5 tools)
  // =========================================================================

  tool(
    api,
    "list_proofs",
    "List Proofs",
    "List cryptographic proofs with filtering and pagination. Every mutation in the system generates a SHA-256 fingerprinted proof. Filter by session, plan, type, or anchor status.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Filter by session UUID",
        },
        plan_id: {
          type: "string",
          description: "Filter by plan UUID",
        },
        type: {
          type: "string",
          enum: [
            "plan_created",
            "plan_adapted",
            "session_started",
            "session_paused",
            "session_resumed",
            "session_ended",
            "analysis_heartbeat",
            "assistant_query",
            "session_batch",
          ],
          description: "Filter by proof type",
        },
        anchored: {
          type: "string",
          enum: ["true", "false"],
          description: "Filter by anchor status",
        },
        limit: {
          type: "number",
          description: "Number of proofs to return (1-200, default 50)",
          minimum: 1,
          maximum: 200,
        },
        offset: {
          type: "number",
          description: "Pagination offset (default 0)",
          minimum: 0,
        },
      },
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(api, config, "/proofs", "GET", {
        query: {
          session_id: params.session_id as string | undefined,
          plan_id: params.plan_id as string | undefined,
          type: params.type as string | undefined,
          anchored: params.anchored as string | undefined,
          limit: params.limit !== undefined ? String(params.limit) : undefined,
          offset:
            params.offset !== undefined ? String(params.offset) : undefined,
        },
      });
    }
  );

  tool(
    api,
    "get_proof",
    "Get Proof Details",
    "Get full details of a proof including chain context (previous/next proofs), related proofs in the same session, verification data, and batch membership.",
    {
      type: "object",
      properties: {
        proof_id: {
          type: "string",
          description: "UUID of the proof",
        },
      },
      required: ["proof_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/proofs/${params.proof_id}`,
        "GET"
      );
    }
  );

  tool(
    api,
    "verify_proof",
    "Verify Proof",
    "Verify proof integrity: recalculates the SHA-256 fingerprint, checks chain integrity (previous proof exists and has valid timestamp), and validates anchor data if anchored.",
    {
      type: "object",
      properties: {
        proof_id: {
          type: "string",
          description: "UUID of the proof to verify",
        },
      },
      required: ["proof_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/proofs/${params.proof_id}/verify`,
        "GET"
      );
    }
  );

  tool(
    api,
    "anchor_proof",
    "Anchor Proof",
    "Anchor a proof on Solana (currently simulated). Creates an immutable on-chain record of the proof's fingerprint. Returns anchor transaction details.",
    {
      type: "object",
      properties: {
        proof_id: {
          type: "string",
          description: "UUID of the proof to anchor",
        },
      },
      required: ["proof_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/proofs/${params.proof_id}/anchor`,
        "POST"
      );
    }
  );

  tool(
    api,
    "get_session_proof_batch",
    "Get Session Proof Batch",
    "Get the Merkle batch proof for a completed session. Includes the batch metadata, all individual proofs, and the Merkle tree structure (root, leaves). Batches are created when a session ends.",
    {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "UUID of the session",
        },
      },
      required: ["session_id"],
    },
    async (_ctx, params) => {
      const config = getConfig(api);
      requireApiKey(config);
      return await makeRequest(
        api,
        config,
        `/proofs/session/${params.session_id}/batch`,
        "GET"
      );
    }
  );
}
