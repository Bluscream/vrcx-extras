export function generateOpenApiSpec() {
  return {
    openapi: "3.0.3",
    info: {
      title: "VRCX-Extras API",
      version: "1.0.0",
      description: "Auto-structured REST API specification for VRCX-Extras companion backend. Exposes VRChat launch options, Proton registry management, VRChat config.json, and VRCX SQLite log database endpoints for AI agents and tools."
    },
    servers: [
      {
        url: "http://127.0.0.1:8990",
        description: "Local VRCX-Extras server"
      }
    ],
    paths: {
      "/api/openapi.json": {
        get: {
          summary: "Get OpenAPI / Swagger specification JSON",
          tags: ["System"],
          responses: { "200": { description: "OpenAPI specification JSON schema" } }
        }
      },
      "/api/status": {
        get: {
          summary: "Get VRCX database file status & location",
          tags: ["System"],
          responses: { "200": { description: "Database resolution status" } }
        }
      },
      "/api/settings": {
        get: {
          summary: "Get application settings and disk cache stats",
          tags: ["Settings"],
          responses: { "200": { description: "Current settings" } }
        },
        post: {
          summary: "Save updated application settings",
          tags: ["Settings"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AppSettings" } } }
          },
          responses: { "200": { description: "Saved settings" } }
        },
        delete: {
          summary: "Reset application settings to defaults",
          tags: ["Settings"],
          responses: { "200": { description: "Default settings" } }
        }
      },
      "/api/cache/clear": {
        post: {
          summary: "Clear disk cache of CSV/JSON definitions",
          tags: ["Settings"],
          responses: { "200": { description: "Cache cleared status" } }
        }
      },
      "/api/definitions/{name}": {
        get: {
          summary: "Get definition by name (cmdline, env, registry, configSchema)",
          tags: ["Definitions"],
          parameters: [
            {
              name: "name",
              in: "path",
              required: true,
              schema: { type: "string", enum: ["cmdline", "env", "registry", "configSchema"] }
            },
            {
              name: "refresh",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["true", "false"] }
            }
          ],
          responses: { "200": { description: "Parsed definition entries or JSON schema" } }
        }
      },
      "/api/launcher": {
        get: {
          summary: "Get VRChat launch parameters & active compatibility tool",
          tags: ["Launcher"],
          responses: { "200": { description: "Launch parameters and Steam status" } }
        },
        post: {
          summary: "Update VRChat launch parameters in Steam localconfig.vdf",
          tags: ["Launcher"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    launchOptions: { type: "string" },
                    stopSteamFirst: { type: "boolean" },
                    restartSteamAfter: { type: "boolean" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "Launch options save status" } }
        }
      },
      "/api/launcher/compat-tool": {
        post: {
          summary: "Set active Proton compatibility tool version for VRChat",
          tags: ["Launcher"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    toolName: { type: "string", example: "GE-Proton9-25" },
                    stopSteamFirst: { type: "boolean" },
                    restartSteamAfter: { type: "boolean" }
                  },
                  required: ["toolName"]
                }
              }
            }
          },
          responses: { "200": { description: "Compat tool save status" } }
        }
      },
      "/api/launcher/steam/start": {
        post: {
          summary: "Start Steam process",
          tags: ["Launcher"],
          responses: { "200": { description: "Steam start status" } }
        }
      },
      "/api/launcher/steam/stop": {
        post: {
          summary: "Stop Steam process",
          tags: ["Launcher"],
          responses: { "200": { description: "Steam stop status" } }
        }
      },
      "/api/config": {
        get: {
          summary: "Read VRChat config.json",
          tags: ["VRChat Config"],
          responses: { "200": { description: "VRChat config.json object" } }
        },
        post: {
          summary: "Write VRChat config.json",
          tags: ["VRChat Config"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    config: { type: "object" }
                  },
                  required: ["config"]
                }
              }
            }
          },
          responses: { "200": { description: "Saved config object" } }
        }
      },
      "/api/registry/backups": {
        get: {
          summary: "Get registry backups stored in VRCX database",
          tags: ["Registry"],
          responses: { "200": { description: "Array of registry snapshots" } }
        }
      },
      "/api/registry/reset": {
        post: {
          summary: "Wipe VRChat settings from Proton Wine registry",
          tags: ["Registry"],
          responses: { "200": { description: "Wipe status" } }
        }
      },
      "/api/registry/update": {
        post: {
          summary: "Update or set a Wine registry key for VRChat",
          tags: ["Registry"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    keyName: { type: "string" },
                    value: { type: "string" },
                    valueType: { type: "string", enum: ["REG_DWORD", "REG_SZ", "REG_BINARY"] }
                  },
                  required: ["keyName", "value"]
                }
              }
            }
          },
          responses: { "200": { description: "Key update status" } }
        }
      },
      "/api/search": {
        get: {
          summary: "Search players, locations, and sessions in VRCX database",
          tags: ["VRCX Data"],
          parameters: [
            {
              name: "query",
              in: "query",
              required: true,
              schema: { type: "string" }
            }
          ],
          responses: { "200": { description: "Search results" } }
        }
      },
      "/api/players": {
        get: {
          summary: "Get list of players matching search query or user IDs",
          tags: ["VRCX Data"],
          parameters: [
            { name: "q", in: "query", schema: { type: "string" } },
            { name: "userIds", in: "query", schema: { type: "string" } }
          ],
          responses: { "200": { description: "Matching players" } }
        }
      },
      "/api/find-links": {
        get: {
          summary: "Find overlapping user sessions for cross-referencing",
          tags: ["VRCX Data"],
          parameters: [
            { name: "targetUserIds", in: "query", required: true, schema: { type: "string" } }
          ],
          responses: { "200": { description: "Overlapping session links" } }
        }
      },
      "/api/db/mode": {
        get: {
          summary: "Get database read-only status",
          tags: ["VRCX Data"],
          responses: { "200": { description: "Read-only mode status" } }
        },
        post: {
          summary: "Set database read-only mode",
          tags: ["VRCX Data"],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { type: "object", properties: { readOnly: { type: "boolean" } } } } }
          },
          responses: { "200": { description: "Updated mode status" } }
        }
      }
    },
    components: {
      schemas: {
        AppSettings: {
          type: "object",
          properties: {
            urls: {
              type: "object",
              properties: {
                cmdline: { type: "string" },
                env: { type: "string" },
                registry: { type: "string" },
                configSchema: { type: "string" }
              }
            },
            paths: {
              type: "object",
              properties: {
                steamDir: { type: "string" },
                wineBin: { type: "string" }
              }
            },
            cacheTtlMinutes: { type: "integer" }
          }
        }
      }
    }
  };
}

export const openApiSpec = generateOpenApiSpec();
