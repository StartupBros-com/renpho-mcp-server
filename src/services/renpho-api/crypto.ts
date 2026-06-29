import crypto from 'crypto';
import { ENCRYPTION_SECRET } from './constants.js';

export function encryptAES(content: string): string {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(ENCRYPTION_SECRET, 'utf8'), null);
  let encrypted = cipher.update(content, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return encrypted;
}

export function encryptEmptyBytes(): string {
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(ENCRYPTION_SECRET, 'utf8'), null);
  return Buffer.concat([cipher.update(Buffer.from([])), cipher.final()]).toString('base64');
}

export function decryptAES(encryptedContent: string): string {
  const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(ENCRYPTION_SECRET, 'utf8'), null);
  let decrypted = decipher.update(encryptedContent, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}