import React, { useState, useEffect, useMemo } from 'react';
import { Search, Shield, Terminal, Hash, Download, Loader2, Github, Globe, ChevronRight, Check, X, Filter, Zap, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { searchPlugins, getPluginContext } from './services/api';
import { extractWithGemini } from './services/gemini';
import { PluginSearchResult, ExtractionResult, PermissionNode, CommandInfo, PlaceholderInfo } from './types';
import yaml from 'js-yaml';

export default function App() {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PluginSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginSearchResult | null>(null);
  const [isDeepMode, setIsDeepMode] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [status, setStatus] = useState({ message: '', progress: 0 });
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [filter, setFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'permissions' | 'commands' | 'placeholders'>('permissions');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Search logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (query.length > 2) {
        setIsSearching(true);
        try {
          const results = await searchPlugins(query);
          setSearchResults(results);
        } catch (error) {
          console.error(error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [query]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleExtract = async (plugin: PluginSearchResult) => {
    setSelectedPlugin(plugin);
    setIsExtracting(true);
    setResult(null);
    setStatus({ message: 'Initializing Deep Research...', progress: 10 });

    try {
      // 1. Gather Context from Backend
      setStatus({ message: 'Gathering documentation context...', progress: 40 });
      const { context } = await getPluginContext(plugin.id, plugin.name, isDeepMode);

      // 2. Gemini Extraction in Frontend
      setStatus({ message: 'Gemini AI is parsing data...', progress: 80 });
      const extraction = await extractWithGemini(context);
      
      setResult(extraction);
      setStatus({ message: 'Extraction complete!', progress: 100 });
    } catch (error) {
      console.error(error);
      setStatus({ message: 'Extraction failed. Check API Key or try again.', progress: 0 });
    } finally {
      setIsExtracting(false);
    }
  };

  const filteredPermissions = useMemo(() => 
    result?.permissions.filter(p => 
      p.node.toLowerCase().includes(filter.toLowerCase()) || 
      p.description.toLowerCase().includes(filter.toLowerCase())
    ) || [], [result, filter]);

  const filteredCommands = useMemo(() => 
    result?.commands.filter(c => 
      c.command.toLowerCase().includes(filter.toLowerCase()) || 
      c.description.toLowerCase().includes(filter.toLowerCase())
    ) || [], [result, filter]);

  const filteredPlaceholders = useMemo(() => 
    result?.placeholders.filter(p => 
      p.placeholder.toLowerCase().includes(filter.toLowerCase()) || 
      p.description.toLowerCase().includes(filter.toLowerCase())
    ) || [], [result, filter]);

  const exportData = (format: 'json' | 'yaml') => {
    if (!result) return;
    const data = format === 'json' ? JSON.stringify(result, null, 2) : yaml.dump(result);
    const blob = new Blob([data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPlugin?.name || 'plugin'}_perms.${format}`;
    a.click();
  };

  const getIconUrl = (plugin: PluginSearchResult) => {
    // Using the Spiget API icon endpoint is the most reliable way
    return `https://api.spiget.org/v2/resources/${plugin.id}/icon`;
  };

  const renderPlaceholderCard = (p: PlaceholderInfo, i: number) => (
    <button 
      key={i} 
      onClick={() => copyToClipboard(p.placeholder)}
      className="w-full text-left p-4 bg-background/50 border border-border rounded-lg hover:border-accent-red/50 transition-all group relative active:scale-[0.98]"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <code className="text-accent-red font-mono text-sm font-bold break-all leading-tight">{p.placeholder}</code>
          {copiedText === p.placeholder && (
            <span className="text-[10px] text-accent-red font-mono animate-pulse">COPIED!</span>
          )}
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">{p.description}</p>
      </div>
    </button>
  );

  const renderPermissionCard = (p: PermissionNode, i: number) => (
    <button 
      key={i} 
      onClick={() => copyToClipboard(p.node)}
      className="w-full text-left p-4 bg-background/50 border border-border rounded-lg hover:border-accent-primary/50 transition-all group relative active:scale-[0.98]"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <code className="text-accent-primary font-mono text-sm font-bold break-all leading-tight">{p.node}</code>
          {copiedText === p.node && (
            <span className="text-[10px] text-accent-primary font-mono animate-pulse">COPIED!</span>
          )}
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">{p.description}</p>
      </div>
    </button>
  );

  const renderCommandCard = (c: CommandInfo, i: number) => {
    const cmd = c.command.startsWith('/') ? c.command : `/${c.command}`;
    return (
      <button 
        key={i} 
        onClick={() => copyToClipboard(cmd)}
        className="w-full text-left p-4 bg-background/50 border border-border rounded-lg hover:border-accent-blue/50 transition-all group relative active:scale-[0.98]"
      >
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <code className="text-accent-blue font-mono text-sm font-bold">{cmd}</code>
            {copiedText === cmd && (
              <span className="text-[10px] text-accent-blue font-mono animate-pulse">COPIED!</span>
            )}
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{c.description}</p>
          {c.permission && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
              <Shield className="w-3 h-3 text-gray-600" />
              <code className="text-[10px] text-gray-500 truncate">{c.permission}</code>
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto tech-grid">
      {/* Header */}
      <header className="flex flex-col items-center mb-8 md:mb-12">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex items-center gap-3 mb-2"
        >
          <Zap className="w-8 h-8 md:w-10 md:h-10 text-accent-primary logo-glow" />
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter logo-glow text-accent-primary">PERMSCRAPER</h1>
        </motion.div>
        <p className="text-slate-500 text-[10px] md:text-xs font-mono uppercase tracking-[0.3em] text-center">Deep Research Permission Engine</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Left Column: Search & Status */}
        <div className="lg:col-span-4 space-y-6">
          <section className="glass-panel p-5 md:p-6 space-y-4">
            <h2 className="text-base md:text-lg font-bold flex items-center gap-2 text-slate-100">
              <Search className="w-5 h-5 text-accent-blue" />
              Plugin Search
            </h2>
            <div className="relative">
              <input 
                type="text" 
                placeholder="Search Spigot plugins..."
                className="w-full bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-primary/20 focus:border-accent-primary transition-all placeholder:text-slate-600"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {isSearching && <Loader2 className="absolute right-3 top-3.5 w-5 h-5 animate-spin text-accent-primary" />}
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
              {searchResults.map((plugin) => (
                <div
                  key={plugin.id}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${selectedPlugin?.id === plugin.id ? 'bg-accent-primary/10 border-accent-primary/50 shadow-[0_0_15px_rgba(166,20,255,0.1)]' : 'hover:bg-white/5 border-transparent hover:border-slate-800'}`}
                >
                  <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center overflow-hidden shrink-0 border border-slate-700">
                    {getIconUrl(plugin) ? (
                      <img 
                        key={plugin.id}
                        src={getIconUrl(plugin)!} 
                        alt="" 
                        className="w-full h-full object-cover" 
                        referrerPolicy="no-referrer"
                        loading="eager"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          (e.target as HTMLImageElement).parentElement?.classList.add('bg-slate-800');
                        }}
                      />
                    ) : (
                      <Hash className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold truncate text-slate-200 text-sm">{plugin.name}</div>
                    <div className="text-[10px] text-slate-500 truncate uppercase tracking-wider">{plugin.tag}</div>
                  </div>
                  <button 
                    onClick={() => setSelectedPlugin(plugin)}
                    className={`p-2 rounded-lg transition-colors ${selectedPlugin?.id === plugin.id ? 'text-accent-primary bg-accent-primary/10' : 'text-slate-600 hover:text-accent-primary hover:bg-accent-primary/5'}`}
                  >
                    {selectedPlugin?.id === plugin.id ? <Check className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  </button>
                </div>
              ))}
            </div>

            {selectedPlugin && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-4 border-t border-slate-800 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase text-slate-500 tracking-widest">Deep Mode</span>
                    <button 
                      onClick={() => setIsDeepMode(!isDeepMode)}
                      className={`w-9 h-5 rounded-full relative transition-colors ${isDeepMode ? 'bg-accent-primary' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isDeepMode ? 'left-5' : 'left-1'}`} />
                    </button>
                  </div>
                </div>
                <button 
                  onClick={() => handleExtract(selectedPlugin)}
                  disabled={isExtracting}
                  className="w-full bg-accent-primary text-white font-black py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-accent-primary/90 active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg shadow-accent-primary/20"
                >
                  {isExtracting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-current" />}
                  START EXTRACTION
                </button>
              </motion.div>
            )}

            <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
              <span className="text-[9px] text-slate-600 font-mono uppercase tracking-tighter">Engine v1.2.5-PRO</span>
              <div className="flex items-center gap-1">
                <div className="w-1 h-1 rounded-full bg-accent-primary animate-pulse" />
                <span className="text-[9px] text-slate-600 font-mono uppercase">System Ready</span>
              </div>
            </div>
          </section>

          {/* Status Panel */}
          <AnimatePresence>
            {(isExtracting || status.message) && (
              <motion.section 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="glass-panel p-6 overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Research Status</h3>
                  {isExtracting && <Loader2 className="w-3.5 h-3.5 animate-spin text-accent-primary" />}
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="text-accent-primary status-pulse">{status.message}</span>
                    <span className="text-slate-400">{status.progress}%</span>
                  </div>
                  <div className="w-full h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <motion.div 
                      className="h-full bg-accent-primary primary-glow"
                      initial={{ width: 0 }}
                      animate={{ width: `${status.progress}%` }}
                    />
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-8">
          <section className="glass-panel h-full flex flex-col min-h-[500px] md:min-h-[600px]">
            {/* Results Header */}
            <div className="p-4 md:p-6 border-b border-slate-800 flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex p-1 bg-slate-950/50 rounded-xl border border-slate-800 overflow-x-auto no-scrollbar">
                  <button 
                    onClick={() => setActiveTab('permissions')}
                    className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'permissions' ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/20' : 'text-slate-500 hover:text-slate-200'}`}
                  >
                    <Shield className="w-4 h-4" />
                    Permissions
                  </button>
                  <button 
                    onClick={() => setActiveTab('commands')}
                    className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'commands' ? 'bg-accent-blue text-white shadow-lg shadow-accent-blue/20' : 'text-slate-500 hover:text-slate-200'}`}
                  >
                    <Terminal className="w-4 h-4" />
                    Commands
                  </button>
                  <button 
                    onClick={() => setActiveTab('placeholders')}
                    className={`px-3 md:px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'placeholders' ? 'bg-accent-red text-white shadow-lg shadow-accent-red/20' : 'text-slate-500 hover:text-slate-200'}`}
                  >
                    <Hash className="w-4 h-4" />
                    Placeholders
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:flex-none">
                    <Filter className="absolute left-3 top-2.5 w-4 h-4 text-slate-600" />
                    <input 
                      type="text" 
                      placeholder="Filter..."
                      className="bg-slate-950/50 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-accent-primary w-full sm:w-32 md:w-40"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => exportData('yaml')}
                    disabled={!result}
                    className="p-2 bg-slate-950/50 border border-slate-800 rounded-lg hover:border-accent-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95"
                    title="Export YAML"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Results Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
              {!result && !isExtracting && (
                <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-4 py-12">
                  <div className="p-6 rounded-full bg-slate-900/50 border border-slate-800">
                    <Zap className="w-12 h-12 opacity-20" />
                  </div>
                  <p className="text-center max-w-xs text-sm">Search and select a plugin, then click <b>START EXTRACTION</b> to begin deep research.</p>
                </div>
              )}

              {isExtracting && (
                <div className="h-full flex flex-col items-center justify-center space-y-4 py-12">
                  <div className="relative">
                    <Loader2 className="w-16 h-16 animate-spin text-accent-primary opacity-20" />
                    <Zap className="absolute inset-0 m-auto w-6 h-6 text-accent-primary status-pulse" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-accent-primary font-mono text-sm status-pulse uppercase tracking-widest">Analyzing Documentation</p>
                    <p className="text-slate-600 text-[10px] font-mono uppercase">Scanning sub-pages & wikis...</p>
                  </div>
                </div>
              )}

              {result && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {activeTab === 'permissions' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Admin Permissions */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <h4 className="text-[10px] font-black text-accent-red uppercase tracking-[0.2em] flex items-center gap-2">
                            <Shield className="w-3 h-3" /> Admin Permissions
                          </h4>
                          <span className="text-[9px] font-mono text-slate-600">{filteredPermissions.filter(p => p.category === 'admin').length} NODES</span>
                        </div>
                        <div className="space-y-3">
                          {filteredPermissions.filter(p => p.category === 'admin').map((p, i) => renderPermissionCard(p, i))}
                          {filteredPermissions.filter(p => p.category === 'admin').length === 0 && (
                            <p className="text-xs text-slate-600 italic py-4">No admin permissions found.</p>
                          )}
                        </div>
                      </div>

                      {/* Player Permissions */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <h4 className="text-[10px] font-black text-accent-blue uppercase tracking-[0.2em] flex items-center gap-2">
                            <Zap className="w-3 h-3" /> Player Permissions
                          </h4>
                          <span className="text-[9px] font-mono text-slate-600">{filteredPermissions.filter(p => p.category === 'user').length} NODES</span>
                        </div>
                        <div className="space-y-3">
                          {filteredPermissions.filter(p => p.category === 'user').map((p, i) => renderPermissionCard(p, i))}
                          {filteredPermissions.filter(p => p.category === 'user').length === 0 && (
                            <p className="text-xs text-slate-600 italic py-4">No player permissions found.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'commands' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Admin Commands */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <h4 className="text-[10px] font-black text-accent-red uppercase tracking-[0.2em] flex items-center gap-2">
                            <Terminal className="w-3 h-3" /> Admin Commands
                          </h4>
                          <span className="text-[9px] font-mono text-slate-600">{filteredCommands.filter(c => c.category === 'admin').length} CMDs</span>
                        </div>
                        <div className="space-y-3">
                          {filteredCommands.filter(c => c.category === 'admin').map((c, i) => renderCommandCard(c, i))}
                          {filteredCommands.filter(c => c.category === 'admin').length === 0 && (
                            <p className="text-xs text-slate-600 italic py-4">No admin commands found.</p>
                          )}
                        </div>
                      </div>

                      {/* Player Commands */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                          <h4 className="text-[10px] font-black text-accent-blue uppercase tracking-[0.2em] flex items-center gap-2">
                            <Terminal className="w-3 h-3" /> Player Commands
                          </h4>
                          <span className="text-[9px] font-mono text-slate-600">{filteredCommands.filter(c => c.category === 'user').length} CMDs</span>
                        </div>
                        <div className="space-y-3">
                          {filteredCommands.filter(c => c.category === 'user').map((c, i) => renderCommandCard(c, i))}
                          {filteredCommands.filter(c => c.category === 'user').length === 0 && (
                            <p className="text-xs text-slate-600 italic py-4">No player commands found.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'placeholders' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <h4 className="text-[10px] font-black text-accent-red uppercase tracking-[0.2em] flex items-center gap-2">
                          <Hash className="w-3 h-3" /> PlaceholderAPI Support
                        </h4>
                        <span className="text-[9px] font-mono text-slate-600">{filteredPlaceholders.length} PAPI NODES</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filteredPlaceholders.map((p, i) => renderPlaceholderCard(p, i))}
                        {filteredPlaceholders.length === 0 && <p className="text-center text-slate-500 py-12 col-span-full">No placeholders found.</p>}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Footer Info */}
      <footer className="mt-12 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-6 text-slate-600 text-[10px] font-mono uppercase tracking-wider">
        <div className="flex flex-wrap justify-center md:justify-start items-center gap-4 md:gap-8">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-accent-primary animate-pulse" />
            <span>GEMINI-1.5-FLASH</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5" />
            <span>SPIGET API</span>
          </div>
          <div className="flex items-center gap-2">
            <Github className="w-3.5 h-3.5" />
            <span>GITHUB PROXY</span>
          </div>
        </div>
        <div className="text-center md:text-right space-y-1">
          <p>© 2026 PERMSCRAPER ENGINE BY GODXPRO</p>
          <p className="opacity-40">STRICT JSON SCHEMA ENFORCEMENT</p>
        </div>
      </footer>
    </div>
  );
}
