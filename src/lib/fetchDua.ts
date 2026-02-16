import * as fs from "fs";
import * as path from "path";
import * as vscode from 'vscode';

import { Dua } from "../interfaces";

export const fetchDua = (context: vscode.ExtensionContext): Dua => {
    const filePath = path.join(context.extensionPath, "media", "dua.json");

    const content: Dua[] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const randomIndex = Math.floor(Math.random() * content.length);
    return content[randomIndex];
};
