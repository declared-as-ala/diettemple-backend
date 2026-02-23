"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
/**
 * Vercel serverless entry: wraps Express app and ensures MongoDB is connected.
 */
const mongoose_1 = __importDefault(require("mongoose"));
const serverless_http_1 = __importDefault(require("serverless-http"));
const app_1 = __importDefault(require("../src/app"));
let dbConnected = false;
async function ensureDb() {
    if (dbConnected)
        return;
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('MONGODB_URI is not set. Add it in Vercel Environment Variables.');
    }
    await mongoose_1.default.connect(uri);
    dbConnected = true;
}
const handler = (0, serverless_http_1.default)(app_1.default);
async function default_1(req, res) {
    await ensureDb();
    return handler(req, res);
}
