import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import * as cheerio from "cheerio";
import { GoogleGenAI, Type } from "@google/genai";
import Fuse from "fuse.js";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- API Routes ---

// 1. Search API
app.get("/api/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query required" });

  try {
    // Search Spiget
    const response = await axios.get(`https://api.spiget.org/v2/search/resources/${encodeURIComponent(q as string)}?field=name&size=50`);
    const results = response.data;

    // Deduplicate by ID
    const uniqueResults = Array.from(new Map(results.map((item: any) => [item.id, item])).values());

    // Rank using Fuse.js
    const fuse = new Fuse(uniqueResults, {
      keys: ['name', 'tag'],
      threshold: 0.4
    });

    const ranked = fuse.search(q as string).slice(0, 15).map(r => r.item);
    res.json(ranked);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

// 2. Proxy Scraper
app.post("/api/proxy", async (req, res) => {
  const { url, deep = false } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });
    const $ = cheerio.load(response.data);
    
    // Basic text extraction
    let content = $('body').text().replace(/\s+/g, ' ').trim();
    
    // Link scoring for deep research
    const links: { url: string; score: number }[] = [];
    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      if (!href || !href.startsWith('http')) return;

      let score = 0;
      if (text.includes('permission') || text.includes('placeholder')) score += 15;
      if (text.includes('command')) score += 12;
      if (text.includes('wiki')) score += 5;
      if (text.includes('config')) score += 10;

      if (score > 0) {
        links.push({ url: href, score });
      }
    });

    // Sort links by score
    links.sort((a, b) => b.score - a.score);
    
    const limit = deep ? 10 : 6;
    const topLinks = links.slice(0, limit);

    // Fetch sub-pages
    const subPages = await Promise.all(topLinks.map(async (link) => {
      try {
        const subRes = await axios.get(link.url, { timeout: 5000 });
        const sub$ = cheerio.load(subRes.data);
        return sub$('body').text().replace(/\s+/g, ' ').trim();
      } catch {
        return "";
      }
    }));

    res.json({
      main: content,
      sub: subPages.filter(p => p.length > 0)
    });
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Scraping failed" });
  }
});

// 3. GitHub Scraper
app.get("/api/github", async (req, res) => {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "Plugin name required" });

  try {
    // Search for Java repos
    const searchRes = await axios.get(`https://api.github.com/search/repositories?q=${encodeURIComponent(name as string)}+language:java&sort=stars&order=desc`, {
      headers: { 
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'PermScraper-App'
      }
    });
    
    if (!searchRes.data.items || searchRes.data.items.length === 0) return res.json({ found: false });

    const repo = searchRes.data.items[0];
    const owner = repo.owner.login;
    const repoName = repo.name;

    // Try to find plugin.yml
    const commonPaths = ['src/main/resources/plugin.yml', 'resources/plugin.yml', 'plugin.yml'];
    let pluginYml = "";
    for (const p of commonPaths) {
      try {
        const res = await axios.get(`https://raw.githubusercontent.com/${owner}/${repoName}/master/${p}`, {
          headers: { 'User-Agent': 'PermScraper-App' }
        });
        pluginYml = res.data;
        break;
      } catch {}
    }

    // Fetch README
    let readme = "";
    try {
      const res = await axios.get(`https://raw.githubusercontent.com/${owner}/${repoName}/master/README.md`, {
        headers: { 'User-Agent': 'PermScraper-App' }
      });
      readme = res.data;
    } catch {}

    res.json({ found: true, pluginYml, readme });
  } catch (error) {
    console.error("GitHub error:", error);
    res.json({ found: false });
  }
});

// 5. Web Fallback (DuckDuckGo Lite)
app.get("/api/web-search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query required" });

  try {
    const response = await axios.get(`https://duckduckgo.com/lite/?q=${encodeURIComponent(q as string + " minecraft plugin permissions")}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(response.data);
    const results: string[] = [];
    $('.result-link').each((i, el) => {
      if (i < 5) results.push($(el).text());
    });
    res.json({ results });
  } catch (error) {
    console.error("Web search error:", error);
    res.json({ results: [] });
  }
});

// 4. Context Gathering API
app.post("/api/context", async (req, res) => {
  const { pluginId, pluginName, deep = false } = req.body;
  if (!pluginId || !pluginName) return res.status(400).json({ error: "Plugin info required" });

  try {
    let context = "";

    // 1. Scrape Spigot Page & Sub-pages
    try {
      const spigotUrl = `https://www.spigotmc.org/resources/${pluginId}/`;
      const spigotRes = await axios.get(spigotUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
        timeout: 10000
      });
      const $ = cheerio.load(spigotRes.data);
      
      // Main content
      context += `--- SPIGOT MAIN PAGE ---\n${$('body').text().replace(/\s+/g, ' ').trim()}\n\n`;

      // Link scoring for sub-pages
      const links: { url: string; score: number }[] = [];
      $('a').each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().toLowerCase();
        if (!href || !href.startsWith('http')) return;

        let score = 0;
        if (text.includes('permission') || text.includes('placeholder')) score += 20;
        if (text.includes('command')) score += 15;
        if (text.includes('wiki') || text.includes('documentation')) score += 10;
        if (text.includes('config')) score += 8;

        if (score > 0) {
          links.push({ url: href, score });
        }
      });

      // Sort and limit
      links.sort((a, b) => b.score - a.score);
      const limit = deep ? 10 : 5;
      const topLinks = Array.from(new Set(links.map(l => l.url))).slice(0, limit);

      // Fetch sub-pages in parallel
      const subPages = await Promise.all(topLinks.map(async (url) => {
        try {
          const subRes = await axios.get(url, { 
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 7000 
          });
          const sub$ = cheerio.load(subRes.data);
          // Remove scripts and styles for cleaner text
          sub$('script, style').remove();
          return `--- SUB-PAGE: ${url} ---\n${sub$('body').text().replace(/\s+/g, ' ').trim()}`;
        } catch {
          return "";
        }
      }));

      context += subPages.filter(p => p.length > 0).join('\n\n') + '\n\n';
    } catch (e) {
      console.error("Spigot context error:", e);
      context += `--- SPIGOT PAGE ERROR: Could not scrape Spigot page ---\n\n`;
    }

    // 2. Search GitHub
    try {
      const githubSearch = await axios.get(`https://api.github.com/search/repositories?q=${encodeURIComponent(pluginName)}+language:java&sort=stars&order=desc`, {
        headers: { 'User-Agent': 'PermScraper-App' }
      });
      if (githubSearch.data.items && githubSearch.data.items.length > 0) {
        const repo = githubSearch.data.items[0];
        const owner = repo.owner.login;
        const repoName = repo.name;
        const branches = ['master', 'main', 'develop'];
        const commonPaths = [
          'src/main/resources/plugin.yml', 
          'resources/plugin.yml', 
          'plugin.yml',
          'README.md',
          'docs/permissions.md',
          'docs/commands.md'
        ];

        for (const branch of branches) {
          let branchFound = false;
          for (const p of commonPaths) {
            try {
              const res = await axios.get(`https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${p}`, {
                headers: { 'User-Agent': 'PermScraper-App' }
              });
              context += `--- GITHUB [${branch}] ${p} ---\n${res.data}\n\n`;
              branchFound = true;
            } catch {}
          }
          if (branchFound) break; // If we found files on one branch, assume it's the right one
        }
      }
    } catch (e) {
      console.error("GitHub context error:", e);
    }

    // 3. Web Fallback
    try {
      const webRes = await axios.get(`https://duckduckgo.com/lite/?q=${encodeURIComponent(pluginName + " minecraft plugin permissions")}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const web$ = cheerio.load(webRes.data);
      const webResults: string[] = [];
      web$('.result-link').each((i, el) => {
        if (i < 5) webResults.push(web$(el).text());
      });
      context += `--- WEB SEARCH RESULTS ---\n${webResults.join('\n')}\n\n`;
    } catch (e) {
      console.error("Web context error:", e);
    }

    res.json({ context });
  } catch (error) {
    console.error("Context gathering error:", error);
    res.status(500).json({ error: "Failed to gather context" });
  }
});

// --- Vite Integration ---

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
