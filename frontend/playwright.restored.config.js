import { defineConfig } from '@playwright/test';
import base from './playwright.catalog.config.js';
export default defineConfig({...base,testMatch:'restored-workspace.spec.js'});
