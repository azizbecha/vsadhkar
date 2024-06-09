import { Dua } from "../interfaces";

const fs = require("fs");
const path = require("path");

export const fetchDua = () => {
    // Assuming __dirname is /path/to/project/out in the compiled code
    // We go two levels up to get to the project root
    const projectRoot = path.resolve(__dirname, "..", "..");
    const filePath = path.resolve(projectRoot, "src", "data", "dua.json");

    const content: Dua[] = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const randomIndex = Math.floor(Math.random() * content.length);
    return content[randomIndex];
};
