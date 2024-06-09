import { Dua } from "../interfaces";
const fs = require("fs");
const path = require("path");
import * as vscode from 'vscode';

export const fetchDua = (context: vscode.ExtensionContext): Dua => {
    const filePath = path.join(context.extensionPath, "media", "dua.json");

    const content: Dua[] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const randomIndex = Math.floor(Math.random() * content.length);
    return content[randomIndex];
};
