// ============================================================
// Icon library — line-style icons (24x24 viewBox, 1.6 stroke)
// Matches the Fluent-ish look in the Opus EDM screenshots
// ============================================================
const Ico = ({ children, size = 18, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="1.6"
       strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true" {...rest}>
    {children}
  </svg>
);

// --- sidebar / nav icons ---
const IcHome = (p) => <Ico {...p}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></Ico>;
const IcConnect = (p) => <Ico {...p}><path d="M9 2v4M15 2v4M8 6h8v4a4 4 0 0 1-8 0z" /><path d="M12 14v8" /></Ico>;
const IcSource = (p) => <Ico {...p}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Ico>;
const IcPorter = (p) => <Ico {...p}><path d="M3 8h14l-3-3M21 16H7l3 3" /></Ico>;
const IcFlow = (p) => <Ico {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M8 7l8 4M8 17l8-4" /></Ico>;
const IcInspector = (p) => <Ico {...p}><path d="M14 3h6v6" /><path d="M10 21H4v-6" /><path d="M21 3l-9 9M3 21l9-9" /></Ico>;
const IcMatcher = (p) => <Ico {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><path d="M10 6.5h4M10 6.5l-2-2M10 6.5l-2 2M14 17.5h-4M14 17.5l2-2M14 17.5l2 2" /></Ico>;
const IcConstructor = (p) => <Ico {...p}><line x1="4" y1="6" x2="20" y2="6" /><circle cx="10" cy="6" r="2" fill="#fff" /><line x1="4" y1="12" x2="20" y2="12" /><circle cx="16" cy="12" r="2" fill="#fff" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="8" cy="18" r="2" fill="#fff" /></Ico>;
const IcGenerator = (p) => <Ico {...p}><circle cx="12" cy="12" r="3" /><circle cx="12" cy="12" r="9" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></Ico>;
const IcManager = (p) => <Ico {...p}><rect x="3" y="3" width="6" height="18" rx="1" /><rect x="15" y="3" width="6" height="18" rx="1" /><line x1="3" y1="9" x2="9" y2="9" /><line x1="15" y1="9" x2="21" y2="9" /></Ico>;
const IcRules = (p) => <Ico {...p}><rect x="3" y="4" width="4" height="4" rx="1" /><rect x="3" y="10" width="4" height="4" rx="1" /><rect x="3" y="16" width="4" height="4" rx="1" /><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /></Ico>;
const IcDataProducts = (p) => <Ico {...p}><path d="M3 7l9-4 9 4-9 4z" /><path d="M3 7v10l9 4 9-4V7" /><line x1="12" y1="11" x2="12" y2="21" /></Ico>;
const IcSolutions = (p) => <Ico {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.5 7.5l3 8M16.5 7.5l-3 8" /></Ico>;
const IcWorkflows = (p) => <Ico {...p}><path d="M3 8h6l3 4 3-4h6" /><path d="M3 16h6l3-4" /></Ico>;
const IcPages = (p) => <Ico {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="13" y2="16" /></Ico>;
const IcElements = (p) => <Ico {...p}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><circle cx="12" cy="3" r="1.5" /><circle cx="12" cy="21" r="1.5" /><circle cx="3" cy="12" r="1.5" /><circle cx="21" cy="12" r="1.5" /></Ico>;
const IcApproval = (p) => <Ico {...p}><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 12l3 3 5-6" /></Ico>;
const IcModels = (p) => <Ico {...p}><circle cx="12" cy="6" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M12 8.5v3M10 13l-3 3M14 13l3 3" /></Ico>;
const IcIllustrator = (p) => <Ico {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="9" x2="9" y2="21" /></Ico>;

// --- topbar icons ---
const IcSend = (p) => <Ico {...p}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></Ico>;
const IcShield = (p) => <Ico {...p}><path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z" /></Ico>;
const IcUserShield = (p) => <Ico {...p}><path d="M12 2l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V5z" /><circle cx="12" cy="10" r="2.4" /><path d="M8.5 16c.6-1.6 2-2.6 3.5-2.6s2.9 1 3.5 2.6" /></Ico>;
const IcFolder = (p) => <Ico {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Ico>;
const IcFolderOpen = (p) => <Ico {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2H3z" /><path d="M3 9h19l-2 9a2 2 0 0 1-2 1.6H5A2 2 0 0 1 3 18z" /></Ico>;
const IcComponent = (p) => <Ico {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Ico>;
const IcWand = (p) => <Ico {...p}><path d="M15 4V2M15 14v-2M8 9h2M20 9h2M18.4 6.6l1.4-1.4M18.4 11.4l1.4 1.4M11.6 6.6l-1.4-1.4" /><path d="M3 21l9-9M12.5 11.5l1 1" /></Ico>;
const IcCog = (p) => <Ico {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.7 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Ico>;
const IcBell = (p) => <Ico {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></Ico>;
const IcHelp = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></Ico>;

// --- utility icons ---
const IcChevLeft = (p) => <Ico {...p}><polyline points="15 18 9 12 15 6" /></Ico>;
const IcChevRight = (p) => <Ico {...p}><polyline points="9 18 15 12 9 6" /></Ico>;
const IcChevDown = (p) => <Ico {...p}><polyline points="6 9 12 15 18 9" /></Ico>;
const IcChevDoubleLeft = (p) => <Ico {...p}><polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" /></Ico>;
const IcChevDoubleRight = (p) => <Ico {...p}><polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" /></Ico>;
const IcPlus = (p) => <Ico {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Ico>;
const IcSearch = (p) => <Ico {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></Ico>;
const IcEye = (p) => <Ico {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Ico>;
const IcEyeOff = (p) => <Ico {...p}><path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.5 0-10-7-10-7a17.7 17.7 0 0 1 3.9-4.8" /><path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.5 3.5" /><path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" /><line x1="2" y1="2" x2="22" y2="22" /></Ico>;
const IcWarn = (p) => <Ico {...p}><path d="M12 2L2 20h20z" fill="#fbbf24" stroke="#d97706" /><line x1="12" y1="9" x2="12" y2="14" stroke="#fff" strokeWidth="2" /><circle cx="12" cy="17" r="1" fill="#fff" stroke="none" /></Ico>;
const IcTrash = (p) => <Ico {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></Ico>;
const IcUndo = (p) => <Ico {...p}><path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7L3 9" /></Ico>;
const IcRedo = (p) => <Ico {...p}><path d="M21 7v6h-6" /><path d="M21 13a9 9 0 1 1-3-7l3 3" /></Ico>;
const IcPlay = (p) => <Ico {...p}><polygon points="6 4 20 12 6 20" fill="currentColor" stroke="none" /></Ico>;
const IcStop = (p) => <Ico {...p}><rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" stroke="none" /></Ico>;
const IcImport = (p) => <Ico {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Ico>;
const IcExport = (p) => <Ico {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></Ico>;
const IcArrowRight = (p) => <Ico {...p}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="13 6 19 12 13 18" /></Ico>;
const IcInfo = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="8.01" /><polyline points="11 12 12 12 12 16 13 16" /></Ico>;
const IcEdit = (p) => <Ico {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z" /></Ico>;
const IcEyeView = (p) => IcEye(p);
const IcLink = (p) => <Ico {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" /></Ico>;
const IcHistory = (p) => <Ico {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /><polyline points="12 7 12 12 15 14" /></Ico>;
const IcZoomIn = (p) => <Ico {...p}><circle cx="11" cy="11" r="7" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></Ico>;
const IcZoomOut = (p) => <Ico {...p}><circle cx="11" cy="11" r="7" /><line x1="8" y1="11" x2="14" y2="11" /><line x1="21" y1="21" x2="16.5" y2="16.5" /></Ico>;
const IcFullscreen = (p) => <Ico {...p}><path d="M3 9V3h6M21 9V3h-6M21 15v6h-6M3 15v6h6" /></Ico>;
const IcSparkle = (p) => <Ico {...p}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" /><path d="M19 14l.7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7z" /></Ico>;
const IcCheck = (p) => <Ico {...p}><polyline points="5 12 10 17 19 8" /></Ico>;
const IcX = (p) => <Ico {...p}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></Ico>;
const IcFilter = (p) => <Ico {...p}><polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5" /></Ico>;
const IcRealign = (p) => <Ico {...p}><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /><polyline points="18 9 21 12 18 15" /></Ico>;
const IcReset = (p) => <Ico {...p}><polyline points="1 4 1 10 7 10" /><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></Ico>;
const IcArchive = (p) => <Ico {...p}><rect x="3" y="3" width="18" height="5" rx="1" /><path d="M5 8v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><line x1="10" y1="12" x2="14" y2="12" /></Ico>;
const IcVariables = (p) => <Ico {...p}><polyline points="8 6 2 12 8 18" /><polyline points="16 6 22 12 16 18" /><line x1="14" y1="4" x2="10" y2="20" /></Ico>;
const IcFile = (p) => <Ico {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="14 3 14 9 20 9" /></Ico>;
const IcLightning = (p) => <Ico {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10" /></Ico>;
const IcLogout = (p) => <Ico {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Ico>;
const IcUser = (p) => <Ico {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Ico>;
const IcUsers = (p) => <Ico {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></Ico>;
const IcSliders = (p) => <Ico {...p}><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></Ico>;
const IcRibbon = (p) => <Ico {...p}><path d="M12 15l-3 6 3-2 3 2-3-6z" /><circle cx="12" cy="9" r="6" /></Ico>;
const IcMarketplace = (p) => <Ico {...p}><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M3 9c0 2 2 3 3 3s3-1 3-3c0 2 2 3 3 3s3-1 3-3c0 2 2 3 3 3s3-1 3-3" /></Ico>;
const IcLayers = (p) => <Ico {...p}><polygon points="12 2 22 8.5 12 15 2 8.5" /><polyline points="2 13.5 12 20 22 13.5" /></Ico>;
const IcTag = (p) => <Ico {...p}><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.4" /></Ico>;
const IcSitemap = (p) => <Ico {...p}><rect x="9" y="2" width="6" height="5" rx="1" /><rect x="2" y="17" width="6" height="5" rx="1" /><rect x="16" y="17" width="6" height="5" rx="1" /><path d="M12 7v5M5 17v-2.5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1V17" /></Ico>;
const IcBook = (p) => <Ico {...p}><path d="M4 4a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2z" /><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /></Ico>;
const IcList = (p) => <Ico {...p}><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none" /></Ico>;
const IcPackage = (p) => <Ico {...p}><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.3 7 12 12 20.7 7" /><line x1="12" y1="22" x2="12" y2="12" /></Ico>;
const IcDownload = (p) => <Ico {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></Ico>;
const IcUpgrade = (p) => <Ico {...p}><path d="M12 19V5" /><polyline points="5 12 12 5 19 12" /></Ico>;
const IcStar = (p) => <Ico {...p}><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 21.5 12 18 5.5 21.5 7 14.5 2 9.5 9 9" /></Ico>;
const IcSourceCard = (p) => <Ico {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></Ico>;
const IcAttribute = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></Ico>;
const IcBrowseModels = (p) => <Ico {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /><line x1="6" y1="8.5" x2="6" y2="15.5" /><line x1="18" y1="8.5" x2="18" y2="15.5" /><line x1="8.5" y1="6" x2="15.5" y2="6" /><line x1="8.5" y1="18" x2="15.5" y2="18" /></Ico>;
const IcMatching = (p) => <Ico {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><path d="M10 6.5h4M14 17.5h-4" /></Ico>;
const IcMastering = (p) => <Ico {...p}><line x1="4" y1="6" x2="20" y2="6" /><circle cx="10" cy="6" r="2" fill="#fff" /><line x1="4" y1="12" x2="20" y2="12" /><circle cx="16" cy="12" r="2" fill="#fff" /><line x1="4" y1="18" x2="20" y2="18" /><circle cx="8" cy="18" r="2" fill="#fff" /></Ico>;
const IcLock = (p) => <Ico {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Ico>;
const IcUnlock = (p) => <Ico {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" /></Ico>;
const IcGitBranch = (p) => <Ico {...p}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="6" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><circle cx="18" cy="9" r="3" /><path d="M18 12c0 4-6 1-9 6" /></Ico>;
const IcGitCommit = (p) => <Ico {...p}><circle cx="12" cy="12" r="3.5" /><line x1="2" y1="12" x2="8.5" y2="12" /><line x1="15.5" y1="12" x2="22" y2="12" /></Ico>;
const IcFlask = (p) => <Ico {...p}><path d="M9 3h6M10 3v6l-5.5 9.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3" /><line x1="7.5" y1="14" x2="16.5" y2="14" /></Ico>;
const IcServer = (p) => <Ico {...p}><rect x="3" y="4" width="18" height="7" rx="1.5" /><rect x="3" y="13" width="18" height="7" rx="1.5" /><line x1="7" y1="7.5" x2="7.01" y2="7.5" /><line x1="7" y1="16.5" x2="7.01" y2="16.5" /></Ico>;
const IcClock = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></Ico>;
const IcCircleCheck = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><polyline points="8 12 11 15 16 9" /></Ico>;
const IcCircleX = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><line x1="9" y1="9" x2="15" y2="15" /><line x1="15" y1="9" x2="9" y2="15" /></Ico>;
const IcCircleDot = (p) => <Ico {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></Ico>;
const IcDiff = (p) => <Ico {...p}><path d="M12 3v6M9 6h6" /><line x1="9" y1="18" x2="15" y2="18" /><rect x="3" y="3" width="18" height="18" rx="2" /></Ico>;
const IcRollback = (p) => <Ico {...p}><polyline points="1 4 1 10 7 10" /><path d="M3.5 15a9 9 0 1 0 2.1-9.4L1 10" /></Ico>;
const IcDeploy = (p) => <Ico {...p}><path d="M12 2L4 6v6c0 5 3.4 8.5 8 10 4.6-1.5 8-5 8-10V6z" /><polyline points="9 12 11 14 15 9" /></Ico>;
const IcBackup = (p) => <Ico {...p}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /><polyline points="9 15 11 17 15 13" /></Ico>;
const IcThumbUp = (p) => <Ico {...p}><path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z" /><path d="M7 11l4-8a2.5 2.5 0 0 1 2.5 3.5L12 10h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7" /></Ico>;
const IcUsersThree = (p) => <Ico {...p}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.7" /></Ico>;
const IcRocketShip = (p) => <Ico {...p}><path d="M4.5 16.5L4 20l3.5-.5" /><path d="M9 15l-3 3" /><path d="M14 4c4 0 6 3 6 6-3 3-6 5-8 5l-4-4c0-2 2-5 6-7z" /><circle cx="14.5" cy="9.5" r="1.5" /></Ico>;
const IcBolt = (p) => <Ico {...p}><polygon points="13 2 4 14 11 14 10 22 20 9 13 9" /></Ico>;

Object.assign(window, {
  Ico,
  IcHome, IcConnect, IcSource, IcPorter, IcFlow, IcInspector, IcMatcher,
  IcConstructor, IcGenerator, IcManager, IcRules, IcDataProducts, IcSolutions,
  IcWorkflows, IcPages, IcElements, IcApproval, IcModels, IcIllustrator,
  IcSend, IcShield, IcUserShield, IcFolder, IcFolderOpen, IcComponent, IcWand, IcCog, IcBell, IcHelp,
  IcChevLeft, IcChevRight, IcChevDown, IcChevDoubleLeft, IcChevDoubleRight,
  IcPlus, IcSearch, IcEye, IcEyeOff, IcWarn, IcTrash, IcUndo, IcRedo,
  IcPlay, IcStop, IcImport, IcExport, IcArrowRight, IcInfo, IcEdit,
  IcLink, IcHistory, IcZoomIn, IcZoomOut, IcFullscreen, IcSparkle,
  IcCheck, IcX, IcFilter, IcRealign, IcReset, IcArchive, IcVariables,
  IcFile, IcLightning, IcLogout, IcUser, IcUsers, IcSliders, IcRibbon, IcMarketplace, IcLayers, IcTag, IcSitemap, IcBook, IcList, IcPackage, IcDownload, IcUpgrade, IcStar,
  IcSourceCard, IcAttribute, IcBrowseModels, IcMatching, IcMastering,
  IcLock, IcUnlock, IcGitBranch, IcGitCommit, IcFlask, IcServer, IcClock,
  IcCircleCheck, IcCircleX, IcCircleDot, IcDiff, IcRollback, IcDeploy,
  IcBackup, IcThumbUp, IcUsersThree, IcRocketShip, IcBolt,
});
