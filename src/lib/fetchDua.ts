import * as fs from "fs";
import * as path from "path";
import * as vscode from 'vscode';

import { Dua } from "../interfaces";

export const fetchAllDuas = (context: vscode.ExtensionContext): Dua[] => {
    const filePath = path.join(context.extensionPath, "media", "dua.json");
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Dua[];
};

export const pickRandomDua = (duas: Dua[]): Dua => {
    const randomIndex = Math.floor(Math.random() * duas.length);
    return duas[randomIndex];
};

export const fetchDua = (context: vscode.ExtensionContext): Dua => {
    return pickRandomDua(fetchAllDuas(context));
};
