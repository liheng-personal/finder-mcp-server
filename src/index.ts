import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

// ─── AppleScript executor ─────────────────────────────────────────────────────
// SECURITY: Only this function may call osascript. All scripts are hardcoded
// literals defined in this file. No user-supplied script content is ever
// passed to osascript. do shell script is never used.

async function runAppleScript(script: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync("osascript", ["-e", script], {
    timeout: 15_000,
  });
  if (stderr && !stdout) throw new Error(stderr.trim());
  return stdout.trim();
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "finder-mcp-server",
  version: "1.0.0",
});

// ─── Tools ────────────────────────────────────────────────────────────────────

// 1. List files in a folder
server.registerTool(
  "finder_list_folder",
  {
    title: "List Folder Contents",
    description: `List all items (files and folders) inside a given folder path.
Returns names of all items in the folder, one per line.
Use POSIX absolute paths, e.g. /Users/yourname/Desktop.`,
    inputSchema: {
      folder_path: z
        .string()
        .min(1)
        .describe("Absolute POSIX path to the folder, e.g. /Users/alice/Documents"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ folder_path }) => {
    const script = `
tell application "Finder"
  set targetFolder to POSIX file "${folder_path.replace(/"/g, '\\"')}" as alias
  set itemList to name of every item of targetFolder
  set output to ""
  repeat with itemName in itemList
    set output to output & itemName & linefeed
  end repeat
  return output
end tell`;
    try {
      const result = await runAppleScript(script);
      return {
        content: [{ type: "text", text: result || "(empty folder)" }],
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 2. Get current Finder selection
server.registerTool(
  "finder_get_selection",
  {
    title: "Get Current Selection",
    description: `Returns the POSIX paths of all items currently selected in Finder.
Useful for knowing what the user has selected before performing an action.`,
    inputSchema: {},
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async () => {
    const script = `
tell application "Finder"
  set sel to selection
  if sel is {} then return "(nothing selected)"
  set output to ""
  repeat with item in sel
    set output to output & (POSIX path of (item as alias)) & linefeed
  end repeat
  return output
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 3. Open a folder in Finder
server.registerTool(
  "finder_open_folder",
  {
    title: "Open Folder in Finder",
    description: `Opens a folder in Finder and brings it to the front.
Use POSIX absolute paths.`,
    inputSchema: {
      folder_path: z
        .string()
        .min(1)
        .describe("Absolute POSIX path to the folder to open"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ folder_path }) => {
    const script = `
tell application "Finder"
  open (POSIX file "${folder_path.replace(/"/g, '\\"')}" as alias)
  activate
end tell`;
    try {
      await runAppleScript(script);
      return { content: [{ type: "text", text: `Opened: ${folder_path}` }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 4. Reveal a file or folder in Finder
server.registerTool(
  "finder_reveal",
  {
    title: "Reveal in Finder",
    description: `Reveals a file or folder in Finder (selects it in its parent window).
Useful for highlighting a specific item without opening it.`,
    inputSchema: {
      item_path: z
        .string()
        .min(1)
        .describe("Absolute POSIX path to the file or folder to reveal"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ item_path }) => {
    const script = `
tell application "Finder"
  reveal (POSIX file "${item_path.replace(/"/g, '\\"')}" as alias)
  activate
end tell`;
    try {
      await runAppleScript(script);
      return { content: [{ type: "text", text: `Revealed: ${item_path}` }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 5. Create a new folder
server.registerTool(
  "finder_create_folder",
  {
    title: "Create Folder",
    description: `Creates a new folder inside a given parent directory.
Returns the path of the newly created folder.`,
    inputSchema: {
      parent_path: z
        .string()
        .min(1)
        .describe("Absolute POSIX path of the parent directory"),
      folder_name: z
        .string()
        .min(1)
        .max(255)
        .describe("Name for the new folder (no slashes)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ parent_path, folder_name }) => {
    const safeName = folder_name.replace(/"/g, '\\"').replace(/\//g, "");
    const safePath = parent_path.replace(/"/g, '\\"');
    const script = `
tell application "Finder"
  set newFolder to make new folder at (POSIX file "${safePath}" as alias) with properties {name:"${safeName}"}
  return POSIX path of (newFolder as alias)
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: `Created: ${result}` }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 6. Move item to Trash
server.registerTool(
  "finder_move_to_trash",
  {
    title: "Move to Trash",
    description: `Moves a file or folder to the Trash. Does NOT permanently delete.
The item can be recovered from Trash afterwards.`,
    inputSchema: {
      item_path: z
        .string()
        .min(1)
        .describe("Absolute POSIX path of the file or folder to trash"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ item_path }) => {
    const script = `
tell application "Finder"
  move (POSIX file "${item_path.replace(/"/g, '\\"')}" as alias) to trash
end tell`;
    try {
      await runAppleScript(script);
      return { content: [{ type: "text", text: `Moved to Trash: ${item_path}` }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 7. Get item info (size, kind, modification date)
server.registerTool(
  "finder_get_info",
  {
    title: "Get Item Info",
    description: `Returns metadata for a file or folder: name, kind, size, and modification date.`,
    inputSchema: {
      item_path: z
        .string()
        .min(1)
        .describe("Absolute POSIX path to the file or folder"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ item_path }) => {
    const script = `
tell application "Finder"
  set f to (POSIX file "${item_path.replace(/"/g, '\\"')}" as alias)
  set info to properties of f
  set n to name of f
  set k to kind of f
  set m to modification date of f as string
  try
    set s to size of f
    return "Name: " & n & linefeed & "Kind: " & k & linefeed & "Size: " & s & " bytes" & linefeed & "Modified: " & m
  on error
    return "Name: " & n & linefeed & "Kind: " & k & linefeed & "Modified: " & m
  end try
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: result }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// 8. Rename a file or folder
server.registerTool(
  "finder_rename",
  {
    title: "Rename Item",
    description: `Renames a file or folder to a new name (not a new path — stays in the same directory).
Returns the new full path after renaming.`,
    inputSchema: {
      item_path: z
        .string()
        .min(1)
        .describe("Absolute POSIX path to the item to rename"),
      new_name: z
        .string()
        .min(1)
        .max(255)
        .describe("New name for the item (no slashes)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ item_path, new_name }) => {
    const safeName = new_name.replace(/"/g, '\\"').replace(/\//g, "");
    const script = `
tell application "Finder"
  set f to (POSIX file "${item_path.replace(/"/g, '\\"')}" as alias)
  set name of f to "${safeName}"
  return POSIX path of (f as alias)
end tell`;
    try {
      const result = await runAppleScript(script);
      return { content: [{ type: "text", text: `Renamed to: ${result}` }] };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ─── Transport ────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
