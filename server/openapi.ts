export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "VRCX-Extras API",
    version: "1.0.0",
    description: "REST API for VRCX-Extras companion backend. Allows AI agents and third-party tools to control VRChat launch parameters, manage Proton registry backups/edits, inspect VRChat config.json, query VRCX SQLite database logs, and read definitions."
  },
  servers: [
    {
      url: "http://127.0.0.1:8990",
      description: "Local VRCX-Extras companion server"
    }
  ],
  paths: {
    "/api/openapi.json": {
      get: {
        summary: "Get OpenAPI / Swagger 3.0 specification",
        operationId: "getOpenApiSpec",
        tags: ["System"],
        responses: {
          "200": {
            description: "OpenAPI specification JSON schema"
          }
        }
      }
    },
    "/api/settings": {
      get: {
        summary: "Get application settings & disk cache status",
        operationId: "getSettings",
        tags: ["Settings"],
        responses: {
          "200": {
            description: "Current settings and cache status"
          }
        }
      },
      post: {
        summary: "Update application settings",
        operationId: "updateSettings",
        tags: ["Settings"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AppSettings"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated settings"
          }
        }
      },
      delete: {
        summary: "Reset application settings to defaults",
        operationId: "resetSettings",
        tags: ["Settings"],
        responses: {
          "200": {
            description: "Reset confirmation"
          }
        }
      }
    },
    "/api/cache/clear": {
      post: {
        summary: "Clear disk cache of CSV/JSON definitions",
        operationId: "clearCache",
        tags: ["Settings"],
        responses: {
          "200": {
            description: "Cache cleared confirmation"
          }
        }
      }
    },
    "/api/definitions/{name}": {
      get: {
        summary: "Get parsed CSV/JSON definition by name",
        operationId: "getDefinition",
        tags: ["Definitions"],
        parameters: [
          {
            name: "name",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: ["cmdline", "env", "registry", "configSchema"]
            },
            description: "Definition schema identifier"
          },
          {
            name: "refresh",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["true", "false"]
            },
            description: "Force bypass disk cache and fetch fresh remote version"
          }
        ],
        responses: {
          "200": {
            description: "Parsed list of definitions or JSON schema"
          }
        }
      }
    },
    "/api/launcher": {
      get: {
        summary: "Get current VRChat launch options & Steam status",
        operationId: "getLaunchOptions",
        tags: ["Launcher"],
        responses: {
          "200": {
            description: "Launch options string, active compatibility tool, and Steam status"
          }
        }
      },
      post: {
        summary: "Update VRChat launch command in Steam localconfig.vdf",
        operationId: "updateLaunchOptions",
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
        responses: {
          "200": {
            description: "Result status of launch options update"
          }
        }
      }
    },
    "/api/launcher/compat-tool": {
      post: {
        summary: "Set active Steam compatibility tool (Proton version) for VRChat",
        operationId: "setCompatTool",
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
        responses: {
          "200": {
            description: "Result status of compatibility tool selection"
          }
        }
      }
    },
    "/api/launcher/steam/start": {
      post: {
        summary: "Start Steam client process",
        operationId: "startSteam",
        tags: ["Launcher"],
        responses: {
          "200": {
            description: "Steam start status"
          }
        }
      }
    },
    "/api/launcher/steam/stop": {
      post: {
        summary: "Stop Steam client process gracefully",
        operationId: "stopSteam",
        tags: ["Launcher"],
        responses: {
          "200": {
            description: "Steam stop status"
          }
        }
      }
    },
    "/api/config": {
      get: {
        summary: "Get current VRChat config.json settings",
        operationId: "getVRChatConfig",
        tags: ["VRChat Config"],
        responses: {
          "200": {
            description: "Parsed JSON object of VRChat config.json"
          }
        }
      },
      post: {
        summary: "Update VRChat config.json settings",
        operationId: "updateVRChatConfig",
        tags: ["VRChat Config"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  config: { type: "object", description: "Config key-value overrides" }
                },
                required: ["config"]
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Saved config object"
          }
        }
      }
    },
    "/api/registry/current": {
      get: {
        summary: "Read current VRChat Proton Wine registry keys (HKCU\\Software\\VRChat\\vrchat)",
        operationId: "getCurrentRegistry",
        tags: ["Registry"],
        responses: {
          "200": {
            description: "Snapshot of current registry values"
          }
        }
      }
    },
    "/api/registry/backups": {
      get: {
        summary: "List all historical registry backups stored in VRCX database",
        operationId: "getRegistryBackups",
        tags: ["Registry"],
        responses: {
          "200": {
            description: "Array of registry snapshots"
          }
        }
      }
    },
    "/api/registry/restore": {
      post: {
        summary: "Restore a specific registry snapshot or key array into Proton Wine registry",
        operationId: "restoreRegistry",
        tags: ["Registry"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  snapshotId: { type: "string" },
                  entries: { type: "array" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Restore status result"
          }
        }
      }
    },
    "/api/registry/wipe": {
      post: {
        summary: "Wipe VRChat registry settings from Proton Wine registry",
        operationId: "wipeRegistry",
        tags: ["Registry"],
        responses: {
          "200": {
            description: "Wipe status result"
          }
        }
      }
    },
    "/api/registry/key": {
      post: {
        summary: "Update or add a specific Wine registry key for VRChat",
        operationId: "updateRegistryKey",
        tags: ["Registry"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  keyName: { type: "string", example: "graphics_quality_h312345" },
                  value: { type: "string", example: "1" },
                  valueType: { type: "string", enum: ["REG_DWORD", "REG_SZ", "REG_BINARY"] }
                },
                required: ["keyName", "value"]
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Key update status result"
          }
        }
      }
    },
    "/api/search": {
      get: {
        summary: "Unified search across players, locations, and sessions in VRCX database",
        operationId: "unifiedSearch",
        tags: ["VRCX Data"],
        parameters: [
          {
            name: "query",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Search term (player name, user ID, world ID, location string)"
          }
        ],
        responses: {
          "200": {
            description: "Matching players, locations, and sessions"
          }
        }
      }
    },
    "/api/db-status": {
      get: {
        summary: "Get VRCX SQLite database path, lock status, and read-only mode status",
        operationId: "getDbStatus",
        tags: ["VRCX Data"],
        responses: {
          "200": {
            description: "Database status"
          }
        }
      },
      post: {
        summary: "Toggle VRCX SQLite database read-only safety mode",
        operationId: "setDbStatus",
        tags: ["VRCX Data"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  readOnly: { type: "boolean" }
                },
                required: ["readOnly"]
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Updated database status"
          }
        }
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
