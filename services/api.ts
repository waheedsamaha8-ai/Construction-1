
// @ts-nocheck
import { Project, FileItem, ItemType, Task, ProjectStatus, SyncQueueItem, SyncActionType, ProjectLog, ProjectPayment, MarketItem } from '../types';
import { db } from './firebaseConfig'; 
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, setDoc, onSnapshot, getDoc, orderBy } from "firebase/firestore";
import { triggerLoadingStart, triggerLoadingStop, triggerLoadingProgress } from '../components/GlobalLoadingBar';
import { dbService } from './db'; 
import { autoSync } from './backgroundSync'; 
import appletConfig from '../firebase-applet-config.json';

declare const google: any;

const getClientId = () => {
    if ((import.meta as any).env && (import.meta as any).env.VITE_CLIENT_ID) {
        return (import.meta as any).env.VITE_CLIENT_ID;
    }
    if (appletConfig && appletConfig.oAuthClientId) {
        return appletConfig.oAuthClientId;
    }
    return '431585344846-sl2nbjv6np9hu63p1c0cjhfi710h0cq8.apps.googleusercontent.com';
};

const CLIENT_ID = getClientId();
export const APP_ROOT_FOLDER_NAME = 'Construction Projects';
export const ARCHIVE_FOLDER_NAME = 'الأرشيف الهندسي'; 
export const HIDDEN_LOGS_FOLDER = '.System_Log_Assets';

export const ARCHIVE_SECTIONS = [
    { name: 'الكود المصري والمواصفات', icon: 'fa-book-atlas', color: 'blue', desc: 'أصول الصناعة واشتراطات الكود' },
    { name: 'الخبير الهندسي', icon: 'fa-user-graduate', color: 'teal', desc: 'استشارات قانون البناء، الأكواد، والعقود' },
    { name: 'تحليل الأسعار والمقايسات', icon: 'fa-coins', color: 'emerald', desc: 'دراسات التكلفة وتحليل الفئات' },
    { name: 'التنفيذ والإنشاءات', icon: 'fa-helmet-safety', color: 'orange', desc: 'مراحل الهيكل الخرساني والحفر' },
    { name: 'التشطيبات والديكور', icon: 'fa-paint-roller', color: 'purple', desc: 'أعمال التشطيب الداخلي والخارجي' },
    { name: 'التصميم والفينج شوي', icon: 'fa-compass-drafting', color: 'rose', desc: 'تخطيط المساحات وطاقة المكان' },
    { name: 'العقود والمطالبات', icon: 'fa-file-signature', color: 'emerald', desc: 'الإدارة التعاقدية و FIDIC' },
    { name: 'السلامة والصحة المهنية', icon: 'fa-shield-heart', color: 'red', desc: 'إجراءات الأمن والسلامة HSE' },
    { name: 'تقارير عامة', icon: 'fa-file-contract', color: 'slate', desc: 'تقارير متنوعة وملاحظات' }
];

let detectedRootFolderId = localStorage.getItem('google_drive_root_id') || '';
const SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive';

let tokenClient: any;
let accessToken: string | null = localStorage.getItem('google_access_token');

export let GOOGLE_DRIVE_TARGET_ID = detectedRootFolderId || 'Connecting...';

const CACHE_TTL = 1000 * 60 * 60; 
const contentCache = new Map<string, { timestamp: number, data: any }>();

const LOCAL_STORAGE_PROJECTS_KEY = 'construction_pro_projects_sync';
const LOCAL_STORAGE_RECENT_FILES_KEY = 'construction_pro_recent_files_sync';
const LOCAL_STORAGE_MARKET_PRICES_KEY = 'construction_pro_market_prices'; 

const updateCache = (key: string, data: any) => {
    contentCache.set(key, { timestamp: Date.now(), data });
};

const saveToSyncCache = (key: string, data: any) => {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
};

// --- AUTH SERVICE DEFINITION (STRICT ONLINE ONLY) ---
const authService = {
  init: () => {
     if (typeof google === 'undefined') {
         setTimeout(authService.init, 500);
         return;
     }
     try {
         tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: (response: any) => {
                if (response.error !== undefined) {
                    if (response.error === 'popup_closed') {
                        console.log("OAuth popup closed by user.");
                        return;
                    }
                    console.error("Google OAuth Error:", response);
                    if (response.error === 'origin_mismatch' || response.error === 'idpiframe_initialization_failed') {
                        console.warn(`Origin mismatch for domain ${window.location.origin}. Automatically activating local mode.`);
                        authService.signInGuest();
                        return;
                    }
                    alert("حدث خطأ أثناء تسجيل الدخول: " + (response.error_description || response.error));
                    return;
                }
                accessToken = response.access_token;
                localStorage.setItem('google_access_token', accessToken);
                window.location.reload(); 
            },
            error_callback: (err: any) => {
                const errStr = String(err?.message || err?.type || err || '');
                if (errStr.includes('popup_closed') || errStr.includes('Popup window closed') || err?.type === 'popup_closed') {
                    console.log("OAuth popup closed by user.");
                    return;
                }
                console.error("Google OAuth Error Callback:", err);
                if (errStr.includes('origin_mismatch')) {
                    console.warn(`Origin mismatch for domain ${window.location.origin}. Automatically activating local mode.`);
                    authService.signInGuest();
                }
            }
        });
     } catch (e) {
         console.error("Auth Init Error", e);
     }
  },
  // STRICT: Only authenticated if token exists or guest mode is enabled
  isAuthenticated: () => {
      return !!accessToken || localStorage.getItem('guest_mode') === 'true';
  },
  isGuest: () => localStorage.getItem('guest_mode') === 'true',
  
  signIn: () => {
      if (tokenClient) {
          try {
              tokenClient.requestAccessToken({ prompt: '' });
          } catch(e) {
              console.warn("Could not request access token:", e);
          }
      } else {
          authService.init();
          setTimeout(() => {
              if (tokenClient) {
                  try { tokenClient.requestAccessToken({ prompt: '' }); } catch(e) { console.warn(e); }
              }
          }, 300);
      }
  },
  signInGuest: () => {
      localStorage.setItem('guest_mode', 'true');
      window.location.reload();
  },
  signOut: () => {
      if (accessToken && typeof google !== 'undefined') {
          try {
             google.accounts.oauth2.revoke(accessToken, () => { console.log('Token revoked'); });
          } catch(e) {}
      }
      localStorage.removeItem('google_access_token');
      localStorage.removeItem('google_drive_root_id');
      localStorage.removeItem('guest_mode');
      accessToken = null;
      dbService.clearStore('file_blobs'); 
      window.location.reload();
  }
};

const fetchDrive = async (endpoint: string, options: any = {}) => {
    if (authService.isGuest()) return { files: [], id: 'guest_root' };
    if (!accessToken) throw new Error("No Access Token");
    
    const url = `https://www.googleapis.com/drive/v3/${endpoint}`;
    const headers = {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
    };

    const res = await fetch(url, { ...options, headers });
    
    if (res.status === 401) {
        authService.signOut();
        throw new Error("Token Expired");
    }

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || res.statusText);
    }

    if (res.status === 204) return null;
    return res.json();
};

const getMimeType = (file: File) => file.type || 'application/octet-stream';

const uploadFileDirect = async (parentId: string, file: File, onProgress?: (p:number)=>void): Promise<any> => {
    const metadata = {
        name: file.name,
        mimeType: getMimeType(file),
        parents: [parentId]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id');
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
        
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.response));
            } else if (xhr.status === 401) {
                authService.signOut();
                reject(new Error('Token Expired'));
            } else {
                const errorMsg = `Upload failed with status ${xhr.status}`;
                console.error(errorMsg, xhr.response);
                reject(new Error(errorMsg));
            }
        };

        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(form);
    });
};

const uploadFileResumable = async (parentId: string, file: File, onProgress?: (p:number)=>void): Promise<any> => {
    const metadata = {
        name: file.name,
        mimeType: getMimeType(file),
        parents: [parentId]
    };
    
    const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
    });

    if (!initRes.ok) throw new Error("Failed to initiate resumable upload");
    const uploadUrl = initRes.headers.get('Location');
    if (!uploadUrl) throw new Error("No upload URL returned");

    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.response));
            } else if (xhr.status === 401) {
                authService.signOut();
                reject(new Error('Token Expired'));
            } else {
                const errorMsg = `Resumable upload failed with status ${xhr.status}`;
                console.error(errorMsg, xhr.response);
                reject(new Error(errorMsg));
            }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(file);
    });
};

const sanitizeForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
    if (typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            if (obj[key] !== undefined) {
                newObj[key] = sanitizeForFirestore(obj[key]);
            }
        }
        return newObj;
    }
    return obj;
};

// --- SYNC SERVICE ---
let isSyncProcessing = false;
const syncService = {
    addToQueue: async (action: SyncActionType, payload: any) => {
        const item: SyncQueueItem = {
            id: `sync_${Date.now()}_${Math.random()}`,
            action,
            payload,
            createdAt: Date.now(),
            retryCount: 0,
            status: 'pending'
        };
        await dbService.addToQueue(item);
        // Instant sync trigger if online
        if (typeof navigator !== 'undefined' && navigator.onLine) {
            setTimeout(() => { syncService.processQueue(); }, 50);
        }
    },
    getPendingCount: async () => {
        return await dbService.count('sync_queue');
    },
    clearQueue: async () => {
        await dbService.clearQueue();
    },
    processQueue: async () => {
        if (isSyncProcessing || typeof navigator === 'undefined' || !navigator.onLine) return;
        isSyncProcessing = true;
        try {
            const items = await dbService.getAll<SyncQueueItem>('sync_queue');
            if (!items || items.length === 0) {
                isSyncProcessing = false;
                return;
            }

            for (const item of items) {
                try {
                    if (item.action === SyncActionType.CREATE_PROJECT) {
                        await api.createProject(item.payload, true);
                        await dbService.deleteFromQueue(item.id);
                    } else if (item.action === SyncActionType.UPDATE_PROJECT) {
                        await api.updateProject(item.payload.id, item.payload.updates, true);
                        await dbService.deleteFromQueue(item.id);
                    } else if (item.action === SyncActionType.UPLOAD_FILE) {
                        await dbService.deleteFromQueue(item.id);
                    } else {
                        await dbService.deleteFromQueue(item.id);
                    }
                } catch (err: any) {
                    if (err?.code === 'permission-denied' || (item.retryCount && item.retryCount > 2)) {
                        await dbService.deleteFromQueue(item.id);
                    }
                }
            }
        } catch (e) {
            console.warn("Queue sync error:", e);
        } finally {
            isSyncProcessing = false;
        }
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        syncService.processQueue();
    });
}

const enrichProjectWithAI = (project: Project): Project => {
    // UPDATED: Calculate progress based on the LATEST CUMULATIVE PAYMENT
    let calculatedProgress = 0;
    let totalProjectValue = parseFloat(project.value) || 0;
    
    // Fallback to BOQ Total if project value is 0
    if (totalProjectValue === 0 && project.boqItems && project.boqItems.length > 0) {
        totalProjectValue = project.boqItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    }

    if (project.payments && project.payments.length > 0) {
        // Find payment with latest date
        const latestPayment = project.payments.reduce((prev, current) => {
            return (new Date(current.date).getTime() > new Date(prev.date).getTime()) ? current : prev;
        });
        
        const executedValue = latestPayment.cumulativeAmount || 0;
        
        calculatedProgress = totalProjectValue > 0 
            ? Math.min(Math.round((executedValue / totalProjectValue) * 100), 100) 
            : 0;
    }

    let smartStatus = ProjectStatus.DESIGN;
    let statusReason = "لم يتم تسجيل محضر استلام موقع";

    const sortedLogs = (project.executionLogs || []).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let hasSiteHandover = false; 
    let isPaused = false;        
    let isCompleted = false;     

    for (const log of sortedLogs) {
        const text = (log.content || '').toLowerCase();
        
        if (text.includes('استلام موقع') || text.includes('استلام ارض') || text.includes('استلام أرض') || text.includes('تسليم موقع')) {
            hasSiteHandover = true;
            isPaused = false;
        }
        if (text.includes('ايقاف اعمال') || text.includes('إيقاف أعمال') || text.includes('وقف تنفيذ') || text.includes('تعليق الأعمال')) {
            isPaused = true;
        }
        if (text.includes('استئناف') || text.includes('عودة للعمل') || text.includes('محضر استئناف')) {
            isPaused = false;
        }
        if (text.includes('استلام ابتدائي') || text.includes('تسليم ابتدائي') || text.includes('نهو الأعمال')) {
            isCompleted = true;
        }
    }

    if (isCompleted) {
        smartStatus = ProjectStatus.COMPLETED;
        statusReason = "تم تسجيل محضر الاستلام الابتدائي";
    } else if (hasSiteHandover) {
        if (isPaused) {
            smartStatus = ProjectStatus.PAUSED;
            statusReason = "تم تسجيل محضر إيقاف أعمال ولم يتم الاستئناف";
        } else {
            smartStatus = ProjectStatus.ONGOING;
            statusReason = `جاري التنفيذ (إنجاز مالي: ${calculatedProgress}%)`;
        }
    } else {
        smartStatus = ProjectStatus.DESIGN;
        statusReason = "لم يتم تسجيل محضر استلام أرض/موقع في اليوميات";
    }

    return { ...project, calculatedProgress, status: smartStatus, autoStatusReason: statusReason };
};

const DEFAULT_STARTER_PROJECT: Project = {
    id: 'proj_demo_default_1',
    name: 'مشروع برج السلام السكني (نموذج متكامل)',
    location: 'القاهرة - التجمع الخامس',
    contractor: 'شركة النيل للمقاولات العامة',
    value: '15000000',
    status: ProjectStatus.ONGOING,
    calculatedProgress: 45,
    driveFolderId: 'proj_demo_default_1',
    createdAt: new Date().toISOString(),
    boqFolderId: 'boq_demo_1',
    autoStatusReason: 'جاري التنفيذ - أعمال الهيكل الخرساني والتشطيبات',
    executionLogs: [
        {
            id: 'log_demo_1',
            date: new Date().toISOString().split('T')[0],
            content: 'تم استلام موقع المشروع وردم القواعد المسلحة واستكمال صب أعمدة الدور الأرضي وفقاً للمواصفات الفنية الهندسية والكود المصري.'
        }
    ],
    boqItems: [
        { id: 'boq_1', itemNumber: '1', description: 'أعمال حفر في تربة رملية وتجهيز الموقع', unit: 'م3', quantity: 1200, unitPrice: 150 },
        { id: 'boq_2', itemNumber: '2', description: 'خرسانة مسلحة للقواعد والسملات عيار 350 كجم/م3', unit: 'م3', quantity: 450, unitPrice: 4800 },
        { id: 'boq_3', itemNumber: '3', description: 'أعمال هيكل خرساني مسلّح للأعمدة والأسقف', unit: 'م3', quantity: 600, unitPrice: 5200 },
        { id: 'boq_4', itemNumber: '4', description: 'أعمال مباني وأقاطع طوب أسمنتي مفرغ', unit: 'م2', quantity: 2500, unitPrice: 280 }
    ],
    payments: [
        { id: 'pay_1', number: 1, date: new Date().toISOString().split('T')[0], amount: 3500000, cumulativeAmount: 6750000, status: 'approved', notes: 'دفعة مقدمة ومستخلص جاري رقم 1' }
    ]
};

const ensureStarterProjectIfNeeded = async (projects: Project[]): Promise<Project[]> => {
    const validProjects = projects.filter(p => p && p.name && p.name !== ARCHIVE_FOLDER_NAME);
    if (validProjects.length === 0) {
        try {
            await dbService.putItem('projects', DEFAULT_STARTER_PROJECT);
            saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, [DEFAULT_STARTER_PROJECT]);
            return [enrichProjectWithAI(DEFAULT_STARTER_PROJECT)];
        } catch(e) {}
    }
    return validProjects;
};

const createCardHtml = (title: string, content: string) => `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title><style>@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap'); body { font-family: 'Tajawal', sans-serif; padding: 20px; line-height: 1.6; color: #1e293b; direction: rtl; background-color: white; } .archive-content { font-size: 1.1em; } table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 0.9em; } th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; } th { background: #f8fafc; color: #334155; } h1, h2, h3 { color: #1e3a8a; margin-top: 0; } strong { color: #0f172a; } .highlight-box, blockquote { background-color: #f0fdfa; border-right: 4px solid #0d9488; padding: 12px; margin: 15px 0; border-radius: 4px; color: #115e59; } .warning-box { background-color: #fef2f2; border-right: 4px solid #ef4444; padding: 12px; margin: 15px 0; color: #991b1b; }</style></head><body><div class="archive-content">${content}</div></body></html>`;

export const api = {
  initAuth: authService.init,
  isAuthenticated: authService.isAuthenticated,
  isGuest: authService.isGuest,
  signIn: authService.signIn,
  signInGuest: authService.signInGuest,
  signOut: authService.signOut,
  sync: syncService, 
  getSyncProjects(): Project[] { try { const stored = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY); if (stored) return JSON.parse(stored); } catch(e) {} return []; },
  getSyncRecentFiles(): FileItem[] { try { const stored = localStorage.getItem(LOCAL_STORAGE_RECENT_FILES_KEY); if (stored) return JSON.parse(stored); } catch(e) {} return []; },
  getSyncTasks(): Task[] { return [...localTasks]; },
  
  // --- OFFLINE-READY DOWNLOAD FUNCTION ---
  async downloadFileBlob(fileId: string, onProgress?: (percent: number) => void): Promise<Blob> { 
      try {
          const cachedBlob = await dbService.getBlob(fileId);
          if (cachedBlob) {
              if (onProgress) onProgress(100);
              return cachedBlob;
          }
      } catch (e) {}

      if (!navigator.onLine) {
          throw new Error("OFFLINE_NO_CACHE");
      }

      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED");
      
      triggerLoadingStart(); 
      return new Promise((resolve, reject) => { 
          const xhr = new XMLHttpRequest(); 
          xhr.open('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`); 
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`); 
          xhr.responseType = 'blob'; 
          xhr.onprogress = (event) => { 
              if (event.lengthComputable && onProgress) { 
                  const percent = Math.round((event.loaded / event.total) * 100); 
                  onProgress(percent); 
                  triggerLoadingProgress(percent); 
              } 
          }; 
          xhr.onload = async () => { 
              triggerLoadingStop(); 
              if (xhr.status >= 200 && xhr.status < 300) { 
                  const blob = xhr.response; 
                  try { await dbService.putBlob(fileId, blob); } catch (e) {}
                  resolve(blob); 
              } else { 
                  if (xhr.status === 403 || xhr.status === 400 || xhr.status === 500) { 
                      try { 
                          const exportRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`, { headers: { 'Authorization': `Bearer ${accessToken}` } }); 
                          if (exportRes.ok) { 
                              const blob = await exportRes.blob(); 
                              try { await dbService.putBlob(fileId, blob); } catch(e){}
                              if (onProgress) onProgress(100); 
                              resolve(blob); 
                              return; 
                          } 
                      } catch(e) {} 
                  } 
                  reject(new Error(`Download Failed: ${xhr.status}`)); 
              } 
          }; 
          xhr.onerror = () => { 
              triggerLoadingStop(); 
              reject(new Error('Network error during download')); 
          }; 
          xhr.send(); 
      }); 
  },

  async ensureRootFolder(): Promise<string> { if (detectedRootFolderId) return detectedRootFolderId; try { const query = `name = '${APP_ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`; const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id)`); let rootId = ''; if (result.files && result.files.length > 0) rootId = result.files[0].id; else { const createRes = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: APP_ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }) }); rootId = createRes.id; } detectedRootFolderId = rootId; GOOGLE_DRIVE_TARGET_ID = detectedRootFolderId; localStorage.setItem('google_drive_root_id', detectedRootFolderId); await this.ensureArchiveFolder(rootId); return rootId; } catch (e) { return ''; } },
  async ensureArchiveFolder(rootId: string): Promise<string> { let archiveId = ''; try { const query = `name = '${ARCHIVE_FOLDER_NAME}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`; const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id)`); if (result.files && result.files.length > 0) archiveId = result.files[0].id; else { const createRes = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: ARCHIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }) }); archiveId = createRes.id; } } catch(e) { return ''; } if (archiveId) { const contents = await this.getContents(archiveId, true); const existingNames = new Set(contents.filter(i => i.type === ItemType.FOLDER).map(i => i.name)); for (const section of ARCHIVE_SECTIONS) { if (!existingNames.has(section.name)) { await this.createFolder(archiveId, section.name); } } } return archiveId; },
  async ensureHiddenFolder(parentId: string, folderName: string): Promise<string> {
      let folderId = '';
      try {
          const query = `name = '${folderName}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id)`);
          if (result.files && result.files.length > 0) folderId = result.files[0].id;
          else {
              const createRes = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) });
              folderId = createRes.id;
          }
      } catch(e) { return parentId; }
      return folderId;
  },
  async findFileByName(name: string): Promise<{id: string, parentId: string} | null> {
      try {
          const query = `name = '${name}' and trashed = false`;
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id, parents)`);
          if (result.files && result.files.length > 0) {
              const file = result.files[0];
              return { id: file.id, parentId: file.parents ? file.parents[0] : '' };
          }
      } catch(e) {}
      return null;
  },
  async getArchiveFolderId(): Promise<string> { const rootId = await this.ensureRootFolder(); return await this.ensureArchiveFolder(rootId); },

  async saveToArchive(title: string, content: string, sectionName?: string): Promise<string> { triggerLoadingStart(); try { const archiveId = await this.getArchiveFolderId(); if (!archiveId) { throw new Error("Could not find archive folder"); } let targetFolderId = archiveId; if (sectionName) { const archiveContents = await this.getContents(archiveId, true); const sectionFolder = archiveContents.find(f => f.name === sectionName && f.type === ItemType.FOLDER); if (sectionFolder) { targetFolderId = sectionFolder.id; } } const htmlDoc = createCardHtml(title, content); const file = await this.saveLetter(targetFolderId, title, htmlDoc); return file.id; } finally { triggerLoadingStop(); } },
  getCachedContents(folderId: string): FileItem[] | null { const cached = contentCache.get(folderId); if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) { return cached.data; } return null; },
  getCachedProjects(): Project[] | null { const cached = contentCache.get('projects_list'); if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) { return cached.data; } return null; },
  async getLocalProjects(): Promise<Project[]> { 
      const localProjects = await dbService.getAllItems<Project>('projects'); 
      let processed = localProjects.filter(p => p.name !== ARCHIVE_FOLDER_NAME).map(enrichProjectWithAI); 
      processed = await ensureStarterProjectIfNeeded(processed);
      saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, processed); 
      return processed; 
  },
  
  async exportProjectsBackup(): Promise<string> {
      const projects = await dbService.getAllItems<Project>('projects');
      const dataStr = JSON.stringify(projects, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `construction_projects_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return dataStr;
  },
  
  async importProjectsBackup(jsonData: string): Promise<number> {
      try {
          const parsed = JSON.parse(jsonData);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          let count = 0;
          for (const item of list) {
              if (item && item.name && item.id) {
                  await dbService.putItem('projects', item);
                  count++;
              }
          }
          const current = await this.getLocalProjects();
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, current);
          return count;
      } catch(e) {
          throw new Error("ملف النسخة الاحتياطية غير صالح.");
      }
  },
  
  async getProjectById(id: string, forceRefresh = false): Promise<Project | undefined> { 
      const cachedList = this.getCachedProjects(); 
      const cached = cachedList?.find(p => p.id === id); 
      let subCollectionLogs: ProjectLog[] = [];
      
      // Always fetch fresh logs if online
      if (navigator.onLine && authService.isAuthenticated()) {
          try {
              const logsRef = collection(db, "projects", id, "logs");
              const logsSnap = await getDocs(query(logsRef, orderBy("date", "desc")));
              subCollectionLogs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectLog));
          } catch(e) {}
      }

      if (!forceRefresh && cached) {
          const mergedLogs = [...(cached.executionLogs || []), ...subCollectionLogs];
          const uniqueLogs = Array.from(new Map(mergedLogs.map(item => [item.id, item])).values());
          uniqueLogs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          return { ...cached, executionLogs: uniqueLogs };
      }

      const local = await dbService.getItem<Project>('projects', id); 
      
      if (navigator.onLine) {
          try {
              const docRef = doc(db, "projects", id);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                  const data = docSnap.data() as any;
                  const legacyLogs = (data.executionLogs || []) as ProjectLog[];
                  const allLogs = [...legacyLogs, ...subCollectionLogs];
                  const uniqueLogs = Array.from(new Map(allLogs.map(item => [item.id, item])).values());
                  uniqueLogs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                  
                  const finalProject = enrichProjectWithAI({ id: docSnap.id, ...data, executionLogs: uniqueLogs });
                  
                  // Update cache
                  await dbService.putItem('projects', finalProject);
                  if (cachedList) {
                      const updatedList = cachedList.map(p => p.id === id ? finalProject : p);
                      updateCache('projects_list', updatedList);
                  }

                  return finalProject;
              }
          } catch(e) {}
      }
      
      return local ? enrichProjectWithAI(local) : undefined; 
  },
  
  async getProjects(): Promise<Project[]> { 
      // 1. Instant 0ms response from memory or localStorage
      const cachedList = this.getCachedProjects();
      if (cachedList && cachedList.length > 0) {
          this.refreshProjectsInBackground();
          return cachedList;
      }

      const syncLocal = this.getSyncProjects();
      if (syncLocal && syncLocal.length > 0) {
          this.refreshProjectsInBackground();
          return syncLocal;
      }

      let processedLocal = await this.getLocalProjects(); 
      saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, processedLocal); 
      
      // If offline or guest, return local cache
      if (!navigator.onLine || authService.isGuest()) return processedLocal; 
      
      try { 
          const querySnapshot = await Promise.race([
              getDocs(collection(db, "projects")),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 800))
          ]);
          let firestoreProjects: Project[] = []; 
          if (querySnapshot && !querySnapshot.empty) { 
              firestoreProjects = querySnapshot.docs.map(doc => { 
                  const data = doc.data() as any; 
                  return enrichProjectWithAI({ id: doc.id, ...data }); 
              }); 
          }
          const projectMap = new Map<string, Project>();
          firestoreProjects.forEach(p => projectMap.set(p.id, p));
          processedLocal.forEach(p => { if (!projectMap.has(p.id)) { projectMap.set(p.id, p); } });
          const mergedProjects = Array.from(projectMap.values());
          for (const fp of firestoreProjects) dbService.putItem('projects', fp).catch(()=>{}); 
          updateCache('projects_list', mergedProjects); 
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, mergedProjects); 
          return mergedProjects; 
      } catch (e: any) { 
          return processedLocal; 
      } 
  },

  async refreshProjectsInBackground(): Promise<void> {
      if (!navigator.onLine || authService.isGuest()) return;
      try {
          const querySnapshot = await getDocs(collection(db, "projects"));
          if (!querySnapshot.empty) {
              const list = querySnapshot.docs.map(doc => {
                  const data = doc.data() as any;
                  return enrichProjectWithAI({ id: doc.id, ...data });
              });
              updateCache('projects_list', list);
              saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, list);
              for (const p of list) {
                  dbService.putItem('projects', p).catch(() => {});
              }
          }
      } catch (e) {}
  },

  // Instant real-time multi-device project synchronization listener
  subscribeToProjectsList(onUpdate: (projects: Project[]) => void): () => void {
      // 1. Deliver local sync cache instantly (0ms)
      const cached = this.getSyncProjects();
      if (cached && cached.length > 0) {
          onUpdate(cached);
      }

      this.getLocalProjects().then(local => {
          if (local && local.length > 0) {
              onUpdate(local);
          }
      }).catch(() => {});

      if (!navigator.onLine || authService.isGuest()) return () => {};

      try {
          const unsub = onSnapshot(collection(db, "projects"), (snapshot) => {
              if (!snapshot.empty) {
                  const list = snapshot.docs.map(doc => {
                      const data = doc.data() as any;
                      return enrichProjectWithAI({ id: doc.id, ...data });
                  });
                  updateCache('projects_list', list);
                  saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, list);
                  for (const p of list) {
                      dbService.putItem('projects', p).catch(() => {});
                  }
                  onUpdate(list);
              }
          }, (err) => {
              if (err.code !== 'permission-denied') {
                  console.warn("Real-time projects listener warning:", err);
              }
          });
          return unsub;
      } catch (e) {
          return () => {};
      }
  },

  subscribeToProject(projectId: string, onUpdate: (data: Project) => void): () => void { 
      // STRICT: No offline subscription
      if (!navigator.onLine) return () => {};

      let docData: Project | null = null;
      let logsData: ProjectLog[] = [];

      const mergeAndEmit = () => {
          if (!docData) return;
          const legacyLogs = docData.executionLogs || [];
          const allLogs = [...legacyLogs, ...logsData];
          const uniqueLogs = Array.from(new Map(allLogs.map(item => [item.id, item])).values());
          uniqueLogs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          
          const finalProject = { ...docData, executionLogs: uniqueLogs };
          
          dbService.putItem('projects', finalProject);
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, [finalProject]);
          
          onUpdate(finalProject);
      };

      const unsubDoc = onSnapshot(doc(db, "projects", projectId), (docSnapshot) => { 
          if (docSnapshot.exists()) { 
              const data = docSnapshot.data() as any; 
              docData = enrichProjectWithAI({ id: docSnapshot.id, ...data }); 
              mergeAndEmit();
          } 
      }, (error) => {
          if (error.code === 'permission-denied') {
              console.warn("Firestore Sync Paused: Permissions missing. Data will be served locally.");
              return;
          }
          console.warn("Firestore Doc Snapshot Error (Handled):", error);
      }); 
      
      const unsubLogs = onSnapshot(query(collection(db, "projects", projectId, "logs"), orderBy("date", "desc")), (qSnap) => {
          logsData = qSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectLog));
          mergeAndEmit();
      }, (error) => {
          if (error.code !== 'permission-denied') {
              console.warn("Firestore Logs Snapshot Error (Handled):", error);
          }
      });

      return () => { unsubDoc(); unsubLogs(); };
  },
  async createProject(projectData: any, isSyncProcess = false): Promise<Project> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      contentCache.delete('projects_list'); 
      if (!isSyncProcess) triggerLoadingStart(); 
      const projectId = projectData.id || `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; 
      const newProject: Project = { ...projectData, id: projectId, driveFolderId: projectId, createdAt: new Date().toISOString(), boqFolderId: '', boqItems: [], status: ProjectStatus.DESIGN, executionLogs: [] }; 
      
      try {
          await dbService.putItem('projects', newProject); 
          const currentSync = this.getSyncProjects(); 
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, [enrichProjectWithAI(newProject), ...currentSync]); 
          
          for (let idx = 0; idx < DEFAULT_SUBFOLDERS.length; idx++) { 
              const sub = DEFAULT_SUBFOLDERS[idx]; 
              const folderId = `${projectId}_sub_${idx}`; 
              const folderItem = { 
                  id: folderId, 
                  parentId: projectId, 
                  name: sub, 
                  type: ItemType.FOLDER, 
                  createdTime: new Date().toISOString(),
                  mimeType: 'application/vnd.google-apps.folder',
                  fileCount: 0,
                  folderCount: 0
              }; 
              await dbService.putItem('files', folderItem); 
          } 
      } catch (e) { console.error("Local creation failed", e); }

      if ((!navigator.onLine || authService.isGuest()) && !isSyncProcess) { 
          // Just queue it if offline or guest, but don't promise full functionality
          await syncService.addToQueue(SyncActionType.CREATE_PROJECT, newProject); 
          triggerLoadingStop(); 
          return newProject; 
      } 
      
      try { 
          let driveFolderId = projectId; 
          const rootId = await this.ensureRootFolder(); 
          const driveFolder = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: projectData.name, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }) }); 
          driveFolderId = driveFolder.id; 
          
          for (const sub of DEFAULT_SUBFOLDERS) {
              await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: sub, mimeType: 'application/vnd.google-apps.folder', parents: [driveFolderId] }) }).catch(()=>{}); 
          }

          const firestoreData = { ...projectData, id: driveFolderId, driveFolderId: driveFolderId, createdAt: new Date().toISOString(), boqItems: [], status: ProjectStatus.DESIGN }; 
          await setDoc(doc(db, "projects", driveFolderId), firestoreData); 
          
          if (driveFolderId !== projectId) { 
              await dbService.deleteItem('projects', projectId); 
              await dbService.putItem('projects', firestoreData); 
          } 
          
          if (!isSyncProcess) triggerLoadingStop(); 
          return { ...firestoreData, id: driveFolderId } as Project; 
      } catch (e: any) { 
          if (e.code === 'permission-denied') {
              console.warn("Cloud sync failed (Permissions). Project saved locally.");
              if (!isSyncProcess) triggerLoadingStop();
              return newProject;
          }
          if (!isSyncProcess) { 
              await syncService.addToQueue(SyncActionType.CREATE_PROJECT, newProject); 
              triggerLoadingStop(); 
          } else throw e; 
      } 
      return newProject; 
  },
  async updateProject(id: string, updates: Partial<Project>, isSyncProcess = false): Promise<Project | null> { 
      if (!authService.isAuthenticated()) return null; 
      contentCache.delete('projects_list'); 
      if (!isSyncProcess) triggerLoadingStart(); 
      let project = null;
      try { project = await dbService.getItem<Project>('projects', id); } catch(e) {}
      
      const { executionLogs, ...mainUpdates } = updates;

      if (navigator.onLine && !authService.isGuest()) {
          try {
              const projectRef = doc(db, "projects", id);
              if (Object.keys(mainUpdates).length > 0) {
                  const safeUpdates = sanitizeForFirestore(mainUpdates);
                  await updateDoc(projectRef, safeUpdates);
              }
              const updatedProject = project ? { ...project, ...mainUpdates } : { id, ...mainUpdates } as Project;
              try { if (project) { await dbService.putItem('projects', updatedProject); } } catch (e) {}
              if (!isSyncProcess) triggerLoadingStop();
              return updatedProject;
          } catch (e: any) {
              if (e.code === 'permission-denied') {
                  const updatedProject = project ? { ...project, ...updates } : { id, ...updates } as Project;
                  await dbService.putItem('projects', updatedProject);
                  if (!isSyncProcess) triggerLoadingStop();
                  return updatedProject;
              }
              if (!isSyncProcess) { await syncService.addToQueue(SyncActionType.UPDATE_PROJECT, { id, updates }); triggerLoadingStop(); } else throw e;
          }
      } else {
          if (project) {
              const updatedProject = { ...project, ...updates };
              try { await dbService.putItem('projects', updatedProject); } catch(e) { }
              if (!isSyncProcess) { await syncService.addToQueue(SyncActionType.UPDATE_PROJECT, { id, updates }); }
              if (!isSyncProcess) triggerLoadingStop();
              return updatedProject;
          }
      }
      if (!isSyncProcess) triggerLoadingStop();
      return project;
  },
  async addProjectLog(projectId: string, log: ProjectLog): Promise<void> {
      if (!authService.isAuthenticated()) return;
      try {
          const project = await dbService.getItem<Project>('projects', projectId);
          if (project) {
              const newLogs = [log, ...(project.executionLogs || [])];
              await dbService.putItem('projects', { ...project, executionLogs: newLogs });
          }
      } catch(e) {}

      if (navigator.onLine && !authService.isGuest()) {
          try {
              const logsRef = collection(db, "projects", projectId, "logs");
              await setDoc(doc(logsRef, log.id), log);
          } catch (e: any) { 
              if (e.code !== 'permission-denied') {
                  console.warn("Firestore sync failed, data saved locally.");
              }
          }
      }
  },
  async updateProjectLog(projectId: string, log: ProjectLog): Promise<void> {
      if (!authService.isAuthenticated()) return;
      try {
          const project = await dbService.getItem<Project>('projects', projectId);
          if (project && project.executionLogs) {
              const newLogs = project.executionLogs.map(l => l.id === log.id ? log : l);
              await dbService.putItem('projects', { ...project, executionLogs: newLogs });
          }
      } catch(e) {}

      if (navigator.onLine) {
          try {
              const logRef = doc(db, "projects", projectId, "logs", log.id);
              await setDoc(logRef, log, { merge: true });
          } catch (e: any) { 
              if (e.code !== 'permission-denied') console.warn("Firestore sync failed"); 
          }
      }
  },
  async deleteProjectLog(projectId: string, logId: string): Promise<void> {
      if (!authService.isAuthenticated()) return;
      try {
          const project = await dbService.getItem<Project>('projects', projectId);
          if (project && project.executionLogs) {
              const newLogs = project.executionLogs.filter(l => l.id !== logId);
              await dbService.putItem('projects', { ...project, executionLogs: newLogs });
          }
      } catch(e) {}

      if (navigator.onLine) {
          try {
              const logRef = doc(db, "projects", projectId, "logs", logId);
              await deleteDoc(logRef);
          } catch (e: any) { 
              if (e.code !== 'permission-denied') console.warn("Firestore sync failed");
          }
      }
  },
  async updateProjectMasterData(id: string, data: any): Promise<any> { 
      const { executionLogs, ...otherData } = data;
      return this.updateProject(id, otherData); 
  },
  async deleteProject(id: string): Promise<void> { 
      if (!authService.isAuthenticated()) return; 
      triggerLoadingStart(); 
      contentCache.delete('projects_list'); 
      try { await dbService.deleteItem('projects', id); } catch(e) {} 
      localStorage.removeItem(LOCAL_STORAGE_PROJECTS_KEY); 
      
      if (!authService.isGuest()) {
          try { 
              await deleteDoc(doc(db, "projects", id)); 
              await fetchDrive(`files/${id}`, { method: 'DELETE' }); 
          } catch (e) {} 
      }
      triggerLoadingStop(); 
  },
  async getContents(folderId: string, includeSystemFolders: boolean = false): Promise<FileItem[]> { 
      if (!authService.isAuthenticated()) return []; 
      const rootId = await this.ensureRootFolder(); 
      const targetId = (folderId && folderId !== 'undefined') ? folderId : rootId; 
      
      const allFiles = await dbService.getAllItems<FileItem>('files'); 
      let localChildren = allFiles.filter(f => f.parentId === targetId); 
      if (!includeSystemFolders) { localChildren = localChildren.filter(f => f.name !== ARCHIVE_FOLDER_NAME && f.name !== HIDDEN_LOGS_FOLDER); } 
      localChildren = localChildren.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()); 
      
      if (!navigator.onLine || authService.isGuest()) {
          return localChildren; 
      }
      
      autoSync.prioritizeFolder(localChildren); 

      if (!contentCache.has(targetId) && localChildren.length === 0) triggerLoadingStart(); 
      
      try { 
          let query = `'${targetId}' in parents and trashed = false and name != 'metadata.json'`; 
          if (!includeSystemFolders) { query += ` and name != '${ARCHIVE_FOLDER_NAME}' and name != '${HIDDEN_LOGS_FOLDER}'`; } 
          const fields = 'files(id, name, mimeType, createdTime, webViewLink, webContentLink, thumbnailLink, size)'; 
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=folder,createdTime desc`); 
          
          const data = (result.files || []).map((f: any) => ({ 
              id: f.id, 
              parentId: targetId, 
              name: f.name, 
              type: f.mimeType === 'application/vnd.google-apps.folder' ? ItemType.FOLDER : ItemType.FILE, 
              mimeType: f.mimeType, 
              createdTime: f.createdTime, 
              webViewLink: f.webViewLink, 
              previewUrl: f.thumbnailLink, 
              webContentLink: f.webContentLink, 
              fileCount: 0, 
              folderCount: 0, 
              size: f.size ? parseInt(f.size) : 0 
          })); 
          
          for (const item of data) { await dbService.putItem('files', item); } 
          updateCache(targetId, data); 
          autoSync.prioritizeFolder(data);

          triggerLoadingStop(); 
          return data; 
      } catch (e) { 
          triggerLoadingStop(); 
          return localChildren; 
      } 
  },
  // ... rest of the file
  async enrichItemCounts(items: FileItem[]): Promise<FileItem[]> { 
      if (!navigator.onLine) return items;
      const folders = items.filter(i => i.type === ItemType.FOLDER); 
      if (folders.length === 0) return items; 
      const updatedItems = [...items]; 
      const promises = folders.map(async (folder) => { try { const query = `'${folder.id}' in parents and trashed = false`; const res = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(mimeType,id)`); if (res && res.files) { const filesCount = res.files.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder').length; const foldersCount = res.files.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder').length; const idx = updatedItems.findIndex(i => i.id === folder.id); if (idx !== -1) { updatedItems[idx] = { ...updatedItems[idx], fileCount: filesCount, folderCount: foldersCount }; } } } catch(e) { } }); await Promise.all(promises); return updatedItems; 
  },
  async getFileMetadata(id: string): Promise<FileItem | null> { 
      if (!authService.isAuthenticated()) return null; 
      const localFile = await dbService.getItem<FileItem>('files', id);
      if (!navigator.onLine) { return localFile || null; }
      try { 
          const res = await fetchDrive(`files/${id}?fields=id,name,mimeType,parents,createdTime,size`); 
          return { id: res.id, name: res.name, type: res.mimeType === 'application/vnd.google-apps.folder' ? ItemType.FOLDER : ItemType.FILE, parentId: res.parents?.[0] || '', createdTime: res.createdTime, size: res.size ? parseInt(res.size) : 0 }; 
      } catch (e) { return localFile || null; } 
  },
  async createFolder(parentId: string, name: string): Promise<FileItem> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      contentCache.delete(parentId); 
      triggerLoadingStart(); 
      const tempId = `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const localFolder: FileItem = { id: tempId, parentId, name, type: ItemType.FOLDER, createdTime: new Date().toISOString(), mimeType: 'application/vnd.google-apps.folder', fileCount: 0, folderCount: 0 };
      try { await dbService.putItem('files', localFolder); } catch(e) {}
      if (!navigator.onLine) { triggerLoadingStop(); return localFolder; }
      try { 
          const folder = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) }); 
          await dbService.deleteItem('files', tempId);
          const realFolder = { id: folder.id, parentId, name, type: ItemType.FOLDER, createdTime: new Date().toISOString() };
          await dbService.putItem('files', realFolder);
          triggerLoadingStop(); 
          return realFolder;
      } catch(e) { triggerLoadingStop(); throw e; } 
  },
  async renameItem(id: string, newName: string): Promise<void> { 
      if (!authService.isAuthenticated()) return; 
      const item = await dbService.getItem<FileItem>('files', id);
      if (item) { await dbService.putItem('files', { ...item, name: newName }); }
      if (!navigator.onLine) return;
      triggerLoadingStart(); 
      await fetchDrive(`files/${id}`, { method: 'PATCH', body: JSON.stringify({ name: newName }) }); 
      triggerLoadingStop(); 
  },
  async moveItem(fileId: string, currentParentId: string, newParentId: string): Promise<void> { 
      if (!authService.isAuthenticated()) return; 
      const item = await dbService.getItem<FileItem>('files', fileId);
      if (item) { await dbService.putItem('files', { ...item, parentId: newParentId }); }
      contentCache.delete(currentParentId); contentCache.delete(newParentId); 
      if (!navigator.onLine) return;
      triggerLoadingStart(); 
      await fetchDrive(`files/${fileId}?addParents=${newParentId}&removeParents=${currentParentId}`, { method: 'PATCH' }); 
      triggerLoadingStop(); 
  },
  async shareItem(fileId: string): Promise<string> { if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); try { await fetchDrive(`files/${fileId}/permissions`, { method: 'POST', body: JSON.stringify({ role: 'reader', type: 'anyone' }) }); } catch (e) {} const res = await fetchDrive(`files/${fileId}?fields=webViewLink`); return res.webViewLink; },
  async shareSmart(item: FileItem, fileObj?: File): Promise<void> { 
      try { 
          if (!navigator.share) { alert("خاصية المشاركة غير مدعومة في هذا المتصفح."); return; } 
          if (item.type === ItemType.FOLDER || !fileObj) { 
              const url = item.webViewLink || (window.location.origin + '/#/project/' + item.parentId + '/' + item.id); 
              await navigator.share({ title: item.name, text: `مشاركة ملف: ${item.name}`, url: url }); 
              return; 
          } 
          if (navigator.canShare && navigator.canShare({ files: [fileObj] })) { 
              await navigator.share({ files: [fileObj], title: item.name, text: item.name }); 
          } else { 
              const url = URL.createObjectURL(fileObj); 
              const a = document.createElement('a'); a.href = url; a.download = fileObj.name; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url); 
          } 
      } catch (error: any) { } 
  },
  async deleteItem(id: string, parentId: string): Promise<void> { 
      if (!authService.isAuthenticated()) return; 
      contentCache.delete(parentId); 
      try { await dbService.deleteItem('file_blobs', id); } catch(e){}
      contentCache.forEach((value, key) => { if (Array.isArray(value.data)) { value.data = value.data.filter((f: any) => f.id !== id); } }); 
      try { const recentRaw = localStorage.getItem(LOCAL_STORAGE_RECENT_FILES_KEY); if (recentRaw) { const recent = JSON.parse(recentRaw); const updatedRecent = recent.filter((f: any) => f.id !== id); localStorage.setItem(LOCAL_STORAGE_RECENT_FILES_KEY, JSON.stringify(updatedRecent)); } } catch (e) { } 
      try { await dbService.deleteItem('files', id); } catch(e) {} 
      if (!navigator.onLine) return;
      triggerLoadingStart(); 
      try { await fetchDrive(`files/${id}`, { method: 'DELETE' }); } catch(e: any) { if (e.message && (e.message.includes('403') || e.message.includes('Forbidden'))) throw new Error("ليس لديك صلاحية لحذف هذا الملف."); if (!e.message || !e.message.includes('404')) throw e; } finally { triggerLoadingStop(); } 
  },
  async uploadFile(parentId: string, file: File, onProgress?: (percent: number) => void): Promise<any> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      triggerLoadingStart(); 
      if (!navigator.onLine || authService.isGuest()) {
          const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          try { await dbService.putBlob(tempId, file); } catch(e) { triggerLoadingStop(); throw new Error("Failed to save file offline"); }
          // Queue for later if authenticated
          if (!authService.isGuest()) {
              await syncService.addToQueue(SyncActionType.UPLOAD_FILE, { parentId, tempId, name: file.name, mimeType: file.type });
          }
          const fakeItem: FileItem = { id: tempId, parentId, name: file.name, mimeType: file.type, type: ItemType.FILE, createdTime: new Date().toISOString(), size: file.size };
          await dbService.putItem('files', fakeItem);
          triggerLoadingStop();
          if (onProgress) onProgress(100);
          return fakeItem;
      }
      let result;
      if (file.size > 4 * 1024 * 1024) result = await uploadFileResumable(parentId, file, onProgress);
      else result = await uploadFileDirect(parentId, file, onProgress);
      try { await dbService.putBlob(result.id, file); } catch(e){}
      triggerLoadingStop();
      return result;
  },
  async saveLetter(parentId: string, name: string, content: string, fileId?: string): Promise<FileItem> { 
      if (!authService.isAuthenticated()) throw new Error("AUTH_REQUIRED"); 
      contentCache.delete(parentId); 
      const fileName = name.endsWith('.html') ? name : `${name}.html`; 
      const blob = new Blob([content], { type: 'text/html' }); 
      let targetFileId = fileId;
      if (!targetFileId) { targetFileId = `doc_${Date.now()}_${Math.random()}`; }
      if (fileId) try{ await dbService.deleteItem('file_blobs', fileId); } catch(e){}
      await dbService.putBlob(targetFileId, blob);
      const fileItem = { id: targetFileId, parentId, name: fileName, type: ItemType.FILE, createdTime: new Date().toISOString(), mimeType: 'text/html' };
      await dbService.putItem('files', fileItem);
      if (!navigator.onLine) { return fileItem; }
      triggerLoadingStart(); 
      try { 
          if (fileId) { 
              await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'text/html' }, body: blob }); 
              try { await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fileName }) }); } catch(e) {} 
              return fileItem; 
          } else { 
              const res = await uploadFileDirect(parentId, new File([blob], fileName, { type: 'text/html' })); 
              await dbService.putBlob(res.id, blob); 
              await dbService.deleteItem('files', targetFileId);
              await dbService.deleteItem('file_blobs', targetFileId);
              const realItem = { id: res.id, parentId, name: fileName, type: ItemType.FILE, createdTime: new Date().toISOString() };
              await dbService.putItem('files', realItem);
              return realItem; 
          } 
      } finally { triggerLoadingStop(); } 
  },
  async getFileContent(fileId: string): Promise<string> { 
      try { const cachedBlob = await dbService.getBlob(fileId); if (cachedBlob) return await cachedBlob.text(); } catch(e) {}
      if (!authService.isAuthenticated()) return ''; 
      if (!navigator.onLine) return ''; 
      triggerLoadingStart(); 
      try { const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { 'Authorization': `Bearer ${accessToken}` } }); const text = await response.text(); const blob = new Blob([text], {type: 'text/html'}); await dbService.putBlob(fileId, blob); return text; } finally { triggerLoadingStop(); } 
  },
  async searchFiles(queryText: string): Promise<FileItem[]> { if (!authService.isAuthenticated()) return []; triggerLoadingStart(); try { const result = await fetchDrive(`files?q=name contains '${queryText}' and trashed = false&fields=files(id, name, mimeType, createdTime, webViewLink, thumbnailLink, parents, size)`); return (result.files || []).map((f: any) => ({ id: f.id, parentId: f.parents?.[0] || '', name: f.name, type: f.mimeType === 'application/vnd.google-apps.folder' ? ItemType.FOLDER : ItemType.FILE, mimeType: f.mimeType, createdTime: f.createdTime, webViewLink: f.webViewLink, previewUrl: f.thumbnailLink, size: f.size ? parseInt(f.size) : 0 })); } finally { triggerLoadingStop(); } },
  async getTasks(): Promise<Task[]> { return [...localTasks]; },
  async addTask(content: string): Promise<Task> { const newTask = { id: `t${Date.now()}`, content, isDone: false, createdAt: new Date().toISOString() }; localTasks = [newTask, ...localTasks]; localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(localTasks)); return newTask; },
  async toggleTask(id: string): Promise<void> { const index = localTasks.findIndex(t => t.id === id); if (index !== -1) { localTasks[index].isDone = !localTasks[index].isDone; localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(localTasks)); } },
  async deleteTask(id: string): Promise<void> { localTasks = localTasks.filter(t => t.id !== id); localStorage.setItem(STORAGE_KEYS.TASKS, JSON.stringify(localTasks)); },
  async getRecentFiles(): Promise<FileItem[]> { if (!authService.isAuthenticated()) return []; try { const result = await fetchDrive(`files?q=trashed = false and mimeType != 'application/vnd.google-apps.folder' and name != 'metadata.json'&pageSize=10&orderBy=createdTime desc&fields=files(id, name, mimeType, createdTime, webViewLink, thumbnailLink, parents, size)`); return (result.files || []).map((f: any) => ({ id: f.id, parentId: f.parents?.[0] || '', name: f.name, type: ItemType.FILE, mimeType: f.mimeType, createdTime: f.createdTime, webViewLink: f.webViewLink, previewUrl: f.thumbnailLink, webContentLink: f.webContentLink, size: f.size ? parseInt(f.size) : 0 })); } catch (e) { return []; } },
  subscribeToMarketPrices(onUpdate: (prices: MarketItem[]) => void): () => void {
      if (!navigator.onLine) {
          const saved = localStorage.getItem(LOCAL_STORAGE_MARKET_PRICES_KEY);
          if (saved) {
              try { onUpdate(JSON.parse(saved)); } catch(e){}
          }
          return () => {};
      }
      try {
          const docRef = doc(db, "market_data", "current_prices");
          const unsubscribe = onSnapshot(docRef, (docSnap) => {
              if (docSnap.exists()) {
                  const data = docSnap.data();
                  if (data.items && Array.isArray(data.items) && data.items.length > 0) {
                      localStorage.setItem(LOCAL_STORAGE_MARKET_PRICES_KEY, JSON.stringify(data.items));
                      onUpdate(data.items as MarketItem[]);
                      return;
                  }
              }
              // Auto-seed baseline items into Firebase if empty
              const seed = marketService.getOfflineMarketPrices();
              this.saveMarketPrices(seed).catch(() => {});
              onUpdate(seed);
          }, (error) => {
              console.info("Market real-time sync offline or fallback active:", error);
          });
          return unsubscribe;
      } catch (e) {
          return () => {};
      }
  },
  async getMarketPrices(defaultPrices: MarketItem[]): Promise<MarketItem[]> { 
      const getSeedData = () => {
          if (defaultPrices && defaultPrices.length > 0) return defaultPrices;
          return marketService.getOfflineMarketPrices();
      };

      if (!navigator.onLine) { 
          const saved = localStorage.getItem(LOCAL_STORAGE_MARKET_PRICES_KEY); 
          if (saved) {
              try {
                  const parsed = JSON.parse(saved);
                  if (Array.isArray(parsed) && parsed.length > 0) return parsed;
              } catch (e) {}
          }
          return getSeedData(); 
      } 
      try { 
          const docRef = doc(db, "market_data", "current_prices"); 
          const docSnap = await getDoc(docRef); 
          if (docSnap.exists()) { 
              const data = docSnap.data(); 
              if (data.items && Array.isArray(data.items) && data.items.length > 0) { 
                  localStorage.setItem(LOCAL_STORAGE_MARKET_PRICES_KEY, JSON.stringify(data.items)); 
                  return data.items as MarketItem[]; 
              } 
          } 
          // Seed baseline items to Firestore if doc doesn't exist
          const seed = getSeedData();
          if (seed.length > 0) {
              await this.saveMarketPrices(seed).catch(e => console.warn("Auto-seed save failed", e));
          }
          return seed;
      } catch (e: any) { 
          if (e.code === 'permission-denied') console.warn("Market Sync Permission Denied"); 
          const saved = localStorage.getItem(LOCAL_STORAGE_MARKET_PRICES_KEY); 
          if (saved) {
              try {
                  const parsed = JSON.parse(saved);
                  if (Array.isArray(parsed) && parsed.length > 0) return parsed;
              } catch (e) {}
          }
          return getSeedData(); 
      } 
  },
  async saveMarketPrices(prices: MarketItem[]): Promise<void> { 
      localStorage.setItem(LOCAL_STORAGE_MARKET_PRICES_KEY, JSON.stringify(prices)); 
      if (!navigator.onLine) return; 
      try { 
          await setDoc(doc(db, "market_data", "current_prices"), { items: prices, lastUpdated: new Date().toISOString(), updatedBy: "user_action" }); 
      } catch (e) {
          console.error("Failed to save market prices to Firebase", e);
      } 
  },
  async mergeAndSaveMarketPrices(newItems: MarketItem[], existingPrices: MarketItem[] = []): Promise<void> { 
      let basePrices = existingPrices;
      if (!basePrices || basePrices.length === 0) {
          basePrices = await this.getMarketPrices([]);
      }
      const mergedMap = new Map<string, MarketItem>(); 
      basePrices.forEach(p => mergedMap.set(p.name.trim().toLowerCase(), p)); 
      newItems.forEach(p => { 
          const key = p.name.trim().toLowerCase(); 
          const existing = mergedMap.get(key); 
          if (existing) { 
              mergedMap.set(key, { 
                  ...existing, 
                  price: p.price > 0 ? p.price : existing.price, 
                  unit: p.unit || existing.unit,
                  category: p.category && p.category !== 'other' ? p.category : existing.category,
                  lastUpdated: new Date().toISOString(), 
                  details: p.details || existing.details, 
                  source: p.source || existing.source,
                  trend: p.price > existing.price ? 'up' : (p.price < existing.price ? 'down' : 'stable') 
              }); 
          } else { 
              mergedMap.set(key, { ...p, lastUpdated: new Date().toISOString(), trend: 'stable' }); 
          } 
      }); 
      const finalPrices = Array.from(mergedMap.values()); 
      await this.saveMarketPrices(finalPrices); 
  },
  async migrateGuestData(): Promise<void> { return; } 
};
const DEFAULT_SUBFOLDERS = ['المستندات الرئيسية', 'الاجراءات', 'حصر و مستخلصات', 'صور الموقع', 'الرسومات', 'تسجيلات صوتية'];
let localTasks: Task[] = JSON.parse(localStorage.getItem('construction_pro_tasks') || '[]');
const STORAGE_KEYS = { TASKS: 'construction_pro_tasks' };
