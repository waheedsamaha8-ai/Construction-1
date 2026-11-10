
// @ts-nocheck
import { Project, FileItem, ItemType, Task, ProjectStatus, SyncQueueItem, SyncActionType, ProjectLog, ProjectPayment, MarketItem } from '../types';
import { db } from './firebaseConfig'; 
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, where, setDoc, onSnapshot, getDoc, orderBy } from "firebase/firestore";
import { triggerLoadingStart, triggerLoadingStop, triggerLoadingProgress } from '../components/GlobalLoadingBar';
import { dbService } from './db'; 
import { autoSync } from './backgroundSync'; 
import { marketService } from './ai/market';
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

const CACHE_TTL = 1000 * 60 * 60 * 24; 
const contentCache = new Map<string, { timestamp: number, data: any }>();

const LOCAL_STORAGE_PROJECTS_KEY = 'construction_pro_projects_sync';
const LOCAL_STORAGE_RECENT_FILES_KEY = 'construction_pro_recent_files_sync';
const LOCAL_STORAGE_MARKET_PRICES_KEY = 'construction_pro_market_prices'; 
const LOCAL_STORAGE_FOLDER_CACHE_KEY = 'construction_pro_folder_cache_v1';

// Hydrate memory cache synchronously on startup for 0ms navigation
try {
    const rawProjects = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY);
    if (rawProjects) {
        const parsedProjects = JSON.parse(rawProjects);
        if (Array.isArray(parsedProjects) && parsedProjects.length > 0) {
            contentCache.set('projects_list', { timestamp: Date.now(), data: parsedProjects });
        }
    }
    const rawFolders = localStorage.getItem(LOCAL_STORAGE_FOLDER_CACHE_KEY);
    if (rawFolders) {
        const parsedFolders = JSON.parse(rawFolders);
        if (parsedFolders && typeof parsedFolders === 'object') {
            Object.entries(parsedFolders).forEach(([k, v]: [string, any]) => {
                if (v && Array.isArray(v.data)) {
                    contentCache.set(k, { timestamp: v.timestamp || Date.now(), data: v.data });
                }
            });
        }
    }
} catch (e) {}

const updateCache = (key: string, data: any) => {
    const now = Date.now();
    contentCache.set(key, { timestamp: now, data });
    if (key && key !== 'projects_list' && Array.isArray(data)) {
        try {
            const raw = localStorage.getItem(LOCAL_STORAGE_FOLDER_CACHE_KEY);
            const store = raw ? JSON.parse(raw) : {};
            store[key] = { timestamp: now, data };
            const keys = Object.keys(store);
            if (keys.length > 40) {
                delete store[keys[0]];
            }
            localStorage.setItem(LOCAL_STORAGE_FOLDER_CACHE_KEY, JSON.stringify(store));
        } catch (e) {}
    }
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

export const isSyntheticDriveId = (id: string | null | undefined): boolean => {
    if (!id) return true;
    return id.startsWith('proj_') || 
           id.startsWith('folder_') || 
           id.startsWith('file_') || 
           id.startsWith('pay_') || 
           id.startsWith('log_') || 
           id.startsWith('starter_demo') || 
           id.startsWith('guest_') || 
           id === 'Connecting...';
};

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

const normalizeBoqItems = (items: any[] = []): any[] => {
    if (!Array.isArray(items)) return [];
    return items.filter(Boolean).map((b, idx) => {
        const code = b.itemCode !== undefined ? String(b.itemCode) : (b.itemNumber !== undefined ? String(b.itemNumber) : String(idx + 1));
        const qty = Number(b.quantity) || 0;
        const price = Number(b.unitPrice) || 0;
        const execQty = Number(b.executedQuantity) || 0;
        return {
            ...b,
            id: b.id || `boq_${b.batchId || 'default'}_${idx}_${code.replace(/\s+/g, '_')}`,
            itemCode: code,
            quantity: qty,
            unitPrice: price,
            total: b.total !== undefined && !isNaN(Number(b.total)) && Number(b.total) > 0 ? Number(b.total) : (qty * price),
            executedQuantity: execQty
        };
    });
};

const normalizePayments = (payments: any[] = []): any[] => {
    if (!Array.isArray(payments)) return [];
    return payments.filter(Boolean).map((p, idx) => {
        const cum = Number(p.cumulativeAmount) || Number(p.amount) || Number(p.netAmount) || 0;
        const net = p.netAmount !== undefined ? Number(p.netAmount) : (Number(p.amount) || cum);
        return {
            ...p,
            id: p.id || `pay_${p.date || 'nodate'}_${p.invoiceNumber || p.number || idx}`,
            cumulativeAmount: cum,
            netAmount: net,
            amount: net,
            note: p.note !== undefined ? p.note : (p.notes || '')
        };
    });
};

const sanitizeForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj === 'string') {
        if (obj.length > 150000 && (obj.startsWith('data:image/') || obj.startsWith('data:application/'))) {
            return '';
        }
        return obj;
    }
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

// Ensures the root projects/{id} document NEVER exceeds Firestore's 1MB limit
const prepareProjectForFirestore = (project: Project): any => {
    const sanitized = sanitizeForFirestore(project);
    try {
        const serialized = JSON.stringify(sanitized);
        if (serialized.length > 750000) {
            // Strip heavy inline base64 images from root project doc (logs are already stored in projects/{id}/logs subcollection & IndexedDB)
            if (Array.isArray(sanitized.executionLogs)) {
                sanitized.executionLogs = sanitized.executionLogs.map((l: any) => ({
                    ...l,
                    images: Array.isArray(l.images) ? l.images.filter((img: string) => typeof img === 'string' && !img.startsWith('data:')) : []
                }));
            }
            if (Array.isArray(sanitized.payments)) {
                sanitized.payments = sanitized.payments.map((p: any) => ({
                    ...p,
                    attachments: Array.isArray(p.attachments) ? p.attachments.filter((att: string) => typeof att === 'string' && att.length < 40000) : []
                }));
            }
        }
    } catch (e) {}
    return sanitized;
};

// --- SYNC SERVICE (PERMANENT AUTO-HEALING & NO STUCK QUEUE) ---
let isSyncProcessing = false;
const syncService = {
    addToQueue: async (action: SyncActionType, payload: any) => {
        try {
            const items = await dbService.getAll<SyncQueueItem>('sync_queue');
            // Deduplicate update project actions
            if (action === SyncActionType.UPDATE_PROJECT && payload?.id) {
                const existing = items.find(i => i.action === SyncActionType.UPDATE_PROJECT && i.payload?.id === payload.id);
                if (existing) {
                    existing.payload = payload;
                    existing.createdAt = Date.now();
                    existing.retryCount = 0;
                    await dbService.addToQueue(existing);
                    if (typeof navigator !== 'undefined' && navigator.onLine) {
                        setTimeout(() => { syncService.processQueue(); }, 50);
                    }
                    return;
                }
            }

            // Cap queue length to prevent inflation
            if (items.length > 25) {
                const sorted = items.sort((a, b) => a.createdAt - b.createdAt);
                for (let i = 0; i < items.length - 15; i++) {
                    await dbService.deleteFromQueue(sorted[i].id).catch(() => {});
                }
            }

            const item: SyncQueueItem = {
                id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                action,
                payload,
                createdAt: Date.now(),
                retryCount: 0,
                status: 'pending'
            };
            await dbService.addToQueue(item);
            if (typeof navigator !== 'undefined' && navigator.onLine) {
                setTimeout(() => { syncService.processQueue(); }, 50);
            }
        } catch (e) {
            console.warn("Error adding to sync queue:", e);
        }
    },
    getPendingCount: async () => {
        try {
            return await dbService.count('sync_queue');
        } catch (e) {
            return 0;
        }
    },
    clearQueue: async () => {
        try {
            await dbService.clearQueue();
        } catch (e) {}
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

            const now = Date.now();
            const STALE_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours max lifetime for queue items

            for (const item of items) {
                // Auto-drop stale items older than 12 hours
                if (item.createdAt && (now - item.createdAt > STALE_TIMEOUT)) {
                    await dbService.deleteFromQueue(item.id).catch(() => {});
                    continue;
                }

                // If retried 1 time or more, auto-purge to prevent stuck queue modal
                if ((item.retryCount || 0) >= 1) {
                    console.warn(`[SyncQueue] Purging item ${item.id} after ${item.retryCount} retries.`);
                    await dbService.deleteFromQueue(item.id).catch(() => {});
                    continue;
                }

                try {
                    if (item.action === SyncActionType.CREATE_PROJECT) {
                        if (item.payload && item.payload.name) {
                            await api.createProject(item.payload, true);
                        }
                        await dbService.deleteFromQueue(item.id);
                    } else if (item.action === SyncActionType.UPDATE_PROJECT) {
                        const pId = item.payload?.id || item.payload?.updates?.id;
                        const pUpdates = item.payload?.updates || item.payload;
                        if (pId && pUpdates) {
                            await api.updateProject(pId, pUpdates, true);
                        }
                        await dbService.deleteFromQueue(item.id);
                    } else {
                        await dbService.deleteFromQueue(item.id);
                    }
                } catch (err: any) {
                    console.warn(`[SyncQueue] Purging un-syncable item ${item.id}:`, err);
                    await dbService.deleteFromQueue(item.id).catch(() => {});
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
    if (!project) return project;

    let calculatedProgress = 0;
    
    // 1. Calculate Total Contract / Project Value
    let totalProjectValue = parseFloat(project.value) || 0;
    const boqItems = normalizeBoqItems(project.boqItems);
    const boqTotal = boqItems.reduce((sum, item) => sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
    if (totalProjectValue === 0 && boqTotal > 0) {
        totalProjectValue = boqTotal;
    }

    // 2. Calculate Executed Value from Payment Certificates (المستخلصات) or BOQ items
    let payments = normalizePayments(project.payments);
    const boqExecutedTotal = boqItems.reduce((sum, item) => sum + ((item.executedQuantity || 0) * (item.unitPrice || 0)), 0);

    // If BOQ has executed quantities (> 0) and payments list is empty, synthesize the baseline payment certificate so both tabs match
    if (boqExecutedTotal > 0 && payments.length === 0 && !(project as any)._allowEmptyPayments) {
        const executedItems = boqItems.filter(item => (item.executedQuantity || 0) > 0);
        const batchTitle = executedItems[0]?.batchName ? `مستخلص أعمال تنفيذ (${executedItems[0].batchName.trim()})` : 'مستخلص أعمال منفذة من المقايسة';
        payments = [{
            id: `pay_boq_${project.id}`,
            invoiceNumber: '1',
            date: (project.handoverDate && project.handoverDate.length >= 8) ? project.handoverDate : '2026-11-10',
            cumulativeAmount: boqExecutedTotal,
            netAmount: boqExecutedTotal,
            amount: boqExecutedTotal,
            status: 'approved',
            note: batchTitle,
            items: executedItems.map(item => ({
                boqItemId: item.id,
                itemCode: item.itemCode || '1',
                description: item.description,
                unit: item.unit,
                contractQuantity: item.quantity,
                unitPrice: item.unitPrice,
                prevQuantity: 0,
                currQuantity: item.executedQuantity || 0,
                totalQuantity: item.executedQuantity || 0,
                completionRatio: 100,
                totalValue: (item.executedQuantity || 0) * (item.unitPrice || 0)
            }))
        }];
    }

    let maxExecuted = 0;
    if (payments.length > 0) {
        const cumulativeVals = payments.map(p => {
            const cum = parseFloat(p.cumulativeAmount as any) || 0;
            const net = parseFloat(p.netAmount as any) || 0;
            const amt = parseFloat(p.amount as any) || 0;
            return Math.max(cum, net, amt);
        });
        maxExecuted = Math.max(...cumulativeVals, 0);
    }
    
    if (maxExecuted === 0 && boqExecutedTotal > 0) {
        maxExecuted = boqExecutedTotal;
    }

    if (totalProjectValue > 0 && maxExecuted > 0) {
        const rawRatio = (maxExecuted / totalProjectValue) * 100;
        calculatedProgress = rawRatio < 1 && rawRatio > 0 ? Number(rawRatio.toFixed(1)) : Math.min(Math.round(rawRatio), 100);
    }

    let smartStatus = project.status || ProjectStatus.DESIGN;
    let statusReason = project.autoStatusReason || "لم يتم تسجيل محضر استلام موقع";

    const sortedLogs = [...(project.executionLogs || [])].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let hasSiteHandover = false; 
    let isPaused = false;        
    let isCompleted = false;     

    let inferredHandoverDate = project.handoverDate || '';
    for (const log of sortedLogs) {
        const text = (log.content || '').toLowerCase();
        
        if (text.includes('استلام موقع') || text.includes('استلام ارض') || text.includes('استلام أرض') || text.includes('تسليم موقع')) {
            hasSiteHandover = true;
            isPaused = false;
            if (!inferredHandoverDate && log.date) {
                inferredHandoverDate = log.date;
            }
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

    if (!inferredHandoverDate && sortedLogs.length > 0 && (hasSiteHandover || calculatedProgress > 0 || payments.length > 0)) {
        inferredHandoverDate = sortedLogs[0].date;
    }

    if (isCompleted) {
        smartStatus = ProjectStatus.COMPLETED;
        statusReason = "تم تسجيل محضر الاستلام الابتدائي";
    } else if (hasSiteHandover || calculatedProgress > 0 || payments.length > 0) {
        if (isPaused) {
            smartStatus = ProjectStatus.PAUSED;
            statusReason = "تم تسجيل محضر إيقاف أعمال ولم يتم الاستئناف";
        } else {
            smartStatus = ProjectStatus.ONGOING;
            statusReason = `جاري التنفيذ (إنجاز مالي: ${calculatedProgress}%)`;
        }
    }

    // 3. Calculate Time Elapsed Progress (نسبة المدة المنقضية) vs Financial Progress
    let timeProgress = 0;
    let totalDays = 0;
    let elapsedDays = 0;
    let daysRemaining = 0;
    let scheduleStatus: 'ahead' | 'on_track' | 'delayed' | 'unset' = 'unset';

    const effectiveStartStr = project.handoverDate || inferredHandoverDate;
    let effectiveEndStr = project.completionDate || '';

    if (effectiveStartStr && !effectiveEndStr && smartStatus === ProjectStatus.ONGOING) {
        // Default 12-month contractual duration if start date is known from site handover
        const startObj = new Date(effectiveStartStr);
        if (!isNaN(startObj.getTime())) {
            const endObj = new Date(startObj.getTime() + 365 * 24 * 60 * 60 * 1000);
            effectiveEndStr = endObj.toISOString().split('T')[0];
        }
    }

    if (effectiveStartStr && effectiveEndStr) {
        const startMs = new Date(effectiveStartStr).getTime();
        const endMs = new Date(effectiveEndStr).getTime();
        const nowMs = Date.now();
        if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
            totalDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));
            elapsedDays = Math.max(0, Math.round((nowMs - startMs) / (1000 * 60 * 60 * 24)));
            daysRemaining = Math.round((endMs - nowMs) / (1000 * 60 * 60 * 24));
            const rawTimeRatio = ((nowMs - startMs) / (endMs - startMs)) * 100;
            timeProgress = rawTimeRatio <= 0 ? 0 : rawTimeRatio >= 100 ? 100 : Math.round(rawTimeRatio);

            if (smartStatus === ProjectStatus.COMPLETED || calculatedProgress >= 100) {
                scheduleStatus = 'ahead';
            } else if (calculatedProgress >= timeProgress + 5) {
                scheduleStatus = 'ahead';
            } else if (timeProgress - calculatedProgress > 15) {
                scheduleStatus = 'delayed';
            } else {
                scheduleStatus = 'on_track';
            }
        }
    }

    return {
        ...project,
        handoverDate: project.handoverDate || inferredHandoverDate || '',
        completionDate: project.completionDate || effectiveEndStr || '',
        boqItems,
        payments,
        calculatedProgress,
        timeProgress,
        scheduleStatus,
        daysRemaining,
        totalDays,
        elapsedDays,
        status: smartStatus,
        autoStatusReason: statusReason
    };
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

function mergeProjectData(localP: Project | undefined, remoteP: Project): Project {
    if (!localP) {
        return {
            ...remoteP,
            payments: normalizePayments(remoteP.payments),
            boqItems: normalizeBoqItems(remoteP.boqItems)
        };
    }

    const localTime = Number(localP.updatedAt) || 0;
    const remoteTime = Number(remoteP.updatedAt) || 0;
    const localIsNewer = localTime > 0 && (localTime >= remoteTime || (Date.now() - localTime < 25000));

    // Merge executionLogs (keep local base64 images if remote stripped them for size)
    const localLogs = localP.executionLogs || [];
    const remoteLogs = remoteP.executionLogs || [];
    let mergedLogs: ProjectLog[] = [];
    if (localIsNewer && (localP as any)._allowEmptyLogs) {
        mergedLogs = [...localLogs].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else {
        const logMap = new Map<string, ProjectLog>();
        const olderLogs = localIsNewer ? remoteLogs : localLogs;
        const newerLogs = localIsNewer ? localLogs : remoteLogs;
        olderLogs.forEach(l => { if (l && (l.id || l.content)) logMap.set(l.id || `${l.date}_${l.content}`, l); });
        newerLogs.forEach(l => {
            if (l && (l.id || l.content)) {
                const key = l.id || `${l.date}_${l.content}`;
                const existing = logMap.get(key);
                const images = (l.images && l.images.length > 0) ? l.images : (existing?.images || []);
                logMap.set(key, { ...existing, ...l, images });
            }
        });
        mergedLogs = Array.from(logMap.values()).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    // Payments: NEVER let an empty local array wipe out remote payments unless explicitly deleted
    const localPayments = normalizePayments(localP.payments);
    const remotePayments = normalizePayments(remoteP.payments);
    let mergedPayments: ProjectPayment[] = [];
    if (localIsNewer && (localP as any)._allowEmptyPayments) {
        mergedPayments = localPayments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (localPayments.length === 0 && remotePayments.length > 0) {
        mergedPayments = remotePayments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else if (remotePayments.length === 0 && localPayments.length > 0) {
        mergedPayments = localPayments.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    } else {
        const paymentMap = new Map<string, ProjectPayment>();
        const olderPayments = localIsNewer ? remotePayments : localPayments;
        const newerPayments = localIsNewer ? localPayments : remotePayments;
        olderPayments.forEach(p => { if (p && p.id) paymentMap.set(p.id, p); });
        newerPayments.forEach(p => { if (p && p.id) paymentMap.set(p.id, p); });
        mergedPayments = Array.from(paymentMap.values()).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    // BOQ Items: NEVER let an empty local array wipe out remote BOQ items unless explicitly deleted
    const localBoq = normalizeBoqItems(localP.boqItems);
    const remoteBoq = normalizeBoqItems(remoteP.boqItems);
    let mergedBoq: BOQItem[] = [];
    if (localIsNewer && (localP as any)._allowEmptyBoq) {
        mergedBoq = localBoq;
    } else if (localBoq.length === 0 && remoteBoq.length > 0) {
        mergedBoq = remoteBoq;
    } else if (remoteBoq.length === 0 && localBoq.length > 0) {
        mergedBoq = localBoq;
    } else {
        const boqMap = new Map<string, BOQItem>();
        const olderBoq = localIsNewer ? remoteBoq : localBoq;
        const newerBoq = localIsNewer ? localBoq : remoteBoq;
        olderBoq.forEach(b => {
            if (b) {
                const key = b.id || `${b.batchId || 'default'}_${b.itemCode || ''}_${b.description || ''}`;
                boqMap.set(key, b);
            }
        });
        newerBoq.forEach(b => {
            if (b) {
                const key = b.id || `${b.batchId || 'default'}_${b.itemCode || ''}_${b.description || ''}`;
                boqMap.set(key, b);
            }
        });
        mergedBoq = Array.from(boqMap.values());
    }

    // Engineering Reports
    const localReports = localP.engineeringReports || [];
    const remoteReports = remoteP.engineeringReports || [];
    let mergedReports: EngineeringReportItem[] = [];
    if (localIsNewer && (localP as any)._allowEmptyReports) {
        mergedReports = localReports;
    } else if (localReports.length === 0 && remoteReports.length > 0) {
        mergedReports = remoteReports;
    } else if (remoteReports.length === 0 && localReports.length > 0) {
        mergedReports = localReports;
    } else {
        const reportMap = new Map<string, EngineeringReportItem>();
        const olderRep = localIsNewer ? remoteReports : localReports;
        const newerRep = localIsNewer ? localReports : remoteReports;
        olderRep.forEach(r => { if (r && (r.id || r.title)) reportMap.set(r.id || r.title, r); });
        newerRep.forEach(r => { if (r && (r.id || r.title)) reportMap.set(r.id || r.title, r); });
        mergedReports = Array.from(reportMap.values());
    }

    const mergeById = <T extends { id: string }>(localArr: T[] = [], remoteArr: T[] = []): T[] => {
        if (localArr.length === 0 && remoteArr.length > 0) return remoteArr;
        if (remoteArr.length === 0 && localArr.length > 0) return localArr;
        const map = new Map<string, T>();
        const olderArr = localIsNewer ? remoteArr : localArr;
        const newerArr = localIsNewer ? localArr : remoteArr;
        olderArr.forEach(i => { if (i && i.id) map.set(i.id, i); });
        newerArr.forEach(i => { if (i && i.id) map.set(i.id, i); });
        return Array.from(map.values());
    };

    const mergedRfis = mergeById(localP.rfis, remoteP.rfis);
    const mergedSubmittals = mergeById(localP.submittals, remoteP.submittals);
    const mergedCorr = mergeById(localP.correspondence, remoteP.correspondence);
    const mergedChecklists = mergeById(localP.checklists, remoteP.checklists);
    const mergedNcrs = mergeById(localP.ncrs, remoteP.ncrs);

    return {
        ...remoteP,
        ...localP,
        ...(localIsNewer ? localP : remoteP),
        updatedAt: Math.max(localTime, remoteTime),
        fullDescription: localIsNewer ? (localP.fullDescription ?? remoteP.fullDescription ?? '') : (remoteP.fullDescription || localP.fullDescription || ''),
        soilReportAnalysis: localIsNewer ? (localP.soilReportAnalysis ?? remoteP.soilReportAnalysis ?? '') : (remoteP.soilReportAnalysis || localP.soilReportAnalysis || ''),
        executionLogs: mergedLogs,
        payments: mergedPayments,
        boqItems: mergedBoq,
        engineeringReports: mergedReports,
        rfis: mergedRfis,
        submittals: mergedSubmittals,
        correspondence: mergedCorr,
        checklists: mergedChecklists,
        ncrs: mergedNcrs
    };
}

function deduplicateProjects(projects: Project[]): Project[] {
    if (!projects || projects.length === 0) return [];
    
    const uniqueMap = new Map<string, Project>();
    const hasRealProjects = projects.some(p => p && p.id && p.id !== 'starter_demo_project' && p.name !== ARCHIVE_FOLDER_NAME);

    for (const p of projects) {
        if (!p || !p.id || p.name === ARCHIVE_FOLDER_NAME) continue;
        if (p.id === 'starter_demo_project' && hasRealProjects) {
            dbService.deleteItem('projects', 'starter_demo_project').catch(() => {});
            continue;
        }

        const normalizedName = (p.name || '').trim();
        if (!normalizedName) continue;

        // Check if we already have a project with the same name or matching driveFolderId
        const existingKey = Array.from(uniqueMap.keys()).find(k => {
            const existingProj = uniqueMap.get(k)!;
            return existingProj.id === p.id ||
                   (existingProj.driveFolderId && p.driveFolderId && existingProj.driveFolderId === p.driveFolderId) ||
                   (existingProj.name && p.name && existingProj.name.trim() === normalizedName);
        });

        if (existingKey) {
            const existingProj = uniqueMap.get(existingKey)!;
            const merged = mergeProjectData(existingProj, p);

            // Prefer Google Drive / Firestore real ID over temporary 'proj_' ID
            const preferNewId = p.id && !p.id.startsWith('proj_') && existingProj.id.startsWith('proj_');
            const preferOldId = existingProj.id && !existingProj.id.startsWith('proj_') && p.id.startsWith('proj_');

            if (preferNewId) {
                dbService.deleteItem('projects', existingProj.id).catch(() => {});
                merged.id = p.id;
                merged.driveFolderId = p.driveFolderId || p.id;
                uniqueMap.delete(existingKey);
                uniqueMap.set(p.id, merged);
            } else if (preferOldId) {
                dbService.deleteItem('projects', p.id).catch(() => {});
                merged.id = existingProj.id;
                merged.driveFolderId = existingProj.driveFolderId || existingProj.id;
                uniqueMap.set(existingKey, merged);
            } else {
                uniqueMap.set(existingKey, merged);
            }
        } else {
            uniqueMap.set(p.id, p);
        }
    }

    return Array.from(uniqueMap.values());
}

export const api = {
  initAuth: authService.init,
  isAuthenticated: authService.isAuthenticated,
  isGuest: authService.isGuest,
  getAccessToken: () => accessToken,
  signIn: authService.signIn,
  signInGuest: authService.signInGuest,
  signOut: authService.signOut,
  sync: syncService, 
  getSyncProjects(): Project[] { try { const stored = localStorage.getItem(LOCAL_STORAGE_PROJECTS_KEY); if (stored) return deduplicateProjects(JSON.parse(stored)); } catch(e) {} return []; },
  getSyncRecentFiles(): FileItem[] { try { const stored = localStorage.getItem(LOCAL_STORAGE_RECENT_FILES_KEY); if (stored) return JSON.parse(stored); } catch(e) {} return []; },
  getSyncTasks(): Task[] { return [...localTasks]; },
  
  // --- OFFLINE-READY DOWNLOAD FUNCTION ---
  async downloadFileBlob(fileId: string, onProgress?: (percent: number) => void, silent: boolean = false): Promise<Blob> { 
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
      
      if (!silent) triggerLoadingStart(); 
      return new Promise((resolve, reject) => { 
          const xhr = new XMLHttpRequest(); 
          xhr.open('GET', `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`); 
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`); 
          xhr.responseType = 'blob'; 
          xhr.onprogress = (event) => { 
              if (event.lengthComputable && onProgress) { 
                  const percent = Math.round((event.loaded / event.total) * 100); 
                  onProgress(percent); 
                  if (!silent) triggerLoadingProgress(percent); 
              } 
          }; 
          xhr.onload = async () => { 
              if (!silent) triggerLoadingStop(); 
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
              if (!silent) triggerLoadingStop(); 
              reject(new Error('Network error during download')); 
          }; 
          xhr.send(); 
      }); 
  },

  async ensureRootFolder(): Promise<string> { if (detectedRootFolderId) return detectedRootFolderId; try { const query = `name = '${APP_ROOT_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`; const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id)`); let rootId = ''; if (result.files && result.files.length > 0) rootId = result.files[0].id; else { const createRes = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: APP_ROOT_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }) }); rootId = createRes.id; } detectedRootFolderId = rootId; GOOGLE_DRIVE_TARGET_ID = detectedRootFolderId; localStorage.setItem('google_drive_root_id', detectedRootFolderId); await this.ensureArchiveFolder(rootId); return rootId; } catch (e) { return ''; } },
  async ensureArchiveFolder(rootId: string): Promise<string> { let archiveId = ''; try { const query = `name = '${ARCHIVE_FOLDER_NAME}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`; const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(id)`); if (result.files && result.files.length > 0) archiveId = result.files[0].id; else { const createRes = await fetchDrive('files', { method: 'POST', body: JSON.stringify({ name: ARCHIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] }) }); archiveId = createRes.id; } } catch(e) { return ''; } if (archiveId) { const contents = await this.getContents(archiveId, true); const existingNames = new Set(contents.filter(i => i.type === ItemType.FOLDER).map(i => i.name)); for (const section of ARCHIVE_SECTIONS) { if (!existingNames.has(section.name)) { await this.createFolder(archiveId, section.name); } } } return archiveId; },
  async ensureHiddenFolder(parentId: string, folderName: string): Promise<string> {
      if (isSyntheticDriveId(parentId)) return parentId;
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
  getCachedContents(folderId: string): FileItem[] | null {
      if (!folderId) return null;
      const cached = contentCache.get(folderId);
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
          return cached.data;
      }
      return null;
  },
  async getLocalContents(folderId: string, includeSystemFolders: boolean = false): Promise<FileItem[]> {
      if (!folderId) return [];
      try {
          const allFiles = await dbService.getAllItems<FileItem>('files');
          let localChildren = allFiles.filter(f => f.parentId === folderId);
          if (!includeSystemFolders) {
              localChildren = localChildren.filter(f => f.name !== ARCHIVE_FOLDER_NAME && f.name !== HIDDEN_LOGS_FOLDER);
          }
          localChildren = localChildren.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime());
          if (localChildren.length > 0 && !contentCache.has(folderId)) {
              updateCache(folderId, localChildren);
          }
          return localChildren;
      } catch (e) {
          return [];
      }
  },
  getCachedProjects(): Project[] | null {
      const cached = contentCache.get('projects_list');
      if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
          return cached.data;
      }
      const sync = this.getSyncProjects();
      if (sync && sync.length > 0) {
          contentCache.set('projects_list', { timestamp: Date.now(), data: sync });
          return sync;
      }
      return null;
  },
  async getLocalProjects(): Promise<Project[]> { 
      const localProjects = await dbService.getAllItems<Project>('projects'); 
      let processed = localProjects.filter(p => p.name !== ARCHIVE_FOLDER_NAME).map(enrichProjectWithAI); 
      processed = deduplicateProjects(processed);
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
      
      if (!forceRefresh && cached) {
          // Refresh logs in background without blocking immediate return
          if (navigator.onLine && authService.isAuthenticated()) {
              (async () => {
                  try {
                      const logsRef = collection(db, "projects", id, "logs");
                      const logsSnap = await getDocs(query(logsRef, orderBy("date", "desc")));
                      const freshLogs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectLog));
                      if (freshLogs.length > 0) {
                          const mergedLogs = [...(cached.executionLogs || []), ...freshLogs];
                          const uniqueLogs = Array.from(new Map(mergedLogs.map(item => [item.id, item])).values());
                          uniqueLogs.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                          const updated = { ...cached, executionLogs: uniqueLogs };
                          if (cachedList) {
                              updateCache('projects_list', cachedList.map(p => p.id === id ? updated : p));
                          }
                          await dbService.putItem('projects', updated);
                      }
                  } catch(e) {}
              })();
          }
          return cached;
      }

      let subCollectionLogs: ProjectLog[] = [];
      if (navigator.onLine && authService.isAuthenticated()) {
          try {
              const logsRef = collection(db, "projects", id, "logs");
              const logsSnap = await getDocs(query(logsRef, orderBy("date", "desc")));
              subCollectionLogs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProjectLog));
          } catch(e) {}
      }

      const local = await dbService.getItem<Project>('projects', id); 
      
      if (navigator.onLine) {
          try {
              const docRef = doc(db, "projects", id);
              const docSnap = await getDoc(docRef);
              if (docSnap.exists()) {
                  const data = docSnap.data() as any;
                  const remoteProj = enrichProjectWithAI({ id: docSnap.id, ...data, executionLogs: subCollectionLogs });
                  const finalProject = enrichProjectWithAI(mergeProjectData(local, remoteProj));
                  
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
      
      if (!local) {
          const syncProjects = this.getSyncProjects();
          const syncMatch = syncProjects.find(p => p.id === id || (p.driveFolderId && p.driveFolderId === id));
          if (syncMatch) return enrichProjectWithAI(syncMatch);

          const allLocal = await dbService.getAllItems<Project>('projects').catch(() => []);
          const match = allLocal.find(p => p.id === id || (p.driveFolderId && p.driveFolderId === id));
          if (match) return enrichProjectWithAI(match);
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
          // Allow reasonable timeout (4000ms) so mobile connections complete cloud handshake
          const querySnapshot = await Promise.race([
              getDocs(collection(db, "projects")),
              new Promise<any>((_, reject) => setTimeout(() => reject(new Error("Firestore timeout")), 4000))
          ]);
          let firestoreProjects: Project[] = []; 
          if (querySnapshot && !querySnapshot.empty) { 
              firestoreProjects = querySnapshot.docs.map(doc => { 
                  const data = doc.data() as any; 
                  const localMatch = processedLocal.find(p => p.id === doc.id) || syncLocal.find(p => p.id === doc.id);
                  return mergeProjectData(localMatch, enrichProjectWithAI({ id: doc.id, ...data })); 
              }); 
          }
          const projectMap = new Map<string, Project>();
          firestoreProjects.forEach(p => projectMap.set(p.id, p));

          // Auto-discover Google Drive projects if authenticated
          if (accessToken) {
              try {
                  const rootId = await this.ensureRootFolder();
                  if (rootId) {
                      const driveQuery = `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
                      const driveRes = await fetchDrive(`files?q=${encodeURIComponent(driveQuery)}&fields=files(id,name,createdTime)`);
                      if (driveRes.files && driveRes.files.length > 0) {
                          for (const folder of driveRes.files) {
                              if (folder.name === ARCHIVE_FOLDER_NAME) continue;
                              const existing = Array.from(projectMap.values()).find(p => p.id === folder.id || p.driveFolderId === folder.id || p.name === folder.name);
                              if (existing) {
                                  if (!existing.driveFolderId) existing.driveFolderId = folder.id;
                              } else {
                                  const localMatch = processedLocal.find(p => p.id === folder.id || p.driveFolderId === folder.id || p.name === folder.name);
                                  const discovered: Project = localMatch || {
                                      id: folder.id,
                                      name: folder.name,
                                      driveFolderId: folder.id,
                                      location: 'الموقع الميداني',
                                      contractor: 'المقاول العام',
                                      value: '0',
                                      handoverDate: '',
                                      completionDate: '',
                                      status: ProjectStatus.IN_PROGRESS,
                                      fullDescription: '',
                                      executionLogs: [],
                                      payments: [],
                                      boqItems: []
                                  };
                                  projectMap.set(discovered.id, discovered);
                                  setDoc(doc(db, "projects", discovered.id), sanitizeForFirestore(discovered), { merge: true }).catch(() => {});
                              }
                          }
                      }
                  }
              } catch(e) {}
          }

          processedLocal.forEach(p => { 
              if (!projectMap.has(p.id) && p.id !== 'starter_demo_project') { 
                  projectMap.set(p.id, p); 
              } 
          });
          
          let mergedProjects = Array.from(projectMap.values());
          if (mergedProjects.some(p => p.id !== 'starter_demo_project')) {
              mergedProjects = mergedProjects.filter(p => p.id !== 'starter_demo_project');
              dbService.deleteItem('projects', 'starter_demo_project').catch(() => {});
          }

          for (const fp of mergedProjects) dbService.putItem('projects', fp).catch(()=>{}); 
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
          let firestoreProjects: Project[] = [];
          if (!querySnapshot.empty) {
              const localProjects = await this.getLocalProjects();
              const syncProjects = this.getSyncProjects();
              firestoreProjects = querySnapshot.docs.map(doc => {
                  const data = doc.data() as any;
                  const localMatch = localProjects.find(p => p.id === doc.id) || syncProjects.find(p => p.id === doc.id);
                  return mergeProjectData(localMatch, enrichProjectWithAI({ id: doc.id, ...data }));
              });
          }
          const projectMap = new Map<string, Project>();
          firestoreProjects.forEach(p => projectMap.set(p.id, p));

          if (accessToken) {
              try {
                  const rootId = await this.ensureRootFolder();
                  if (rootId) {
                      const driveQuery = `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
                      const driveRes = await fetchDrive(`files?q=${encodeURIComponent(driveQuery)}&fields=files(id,name,createdTime)`);
                      if (driveRes.files && driveRes.files.length > 0) {
                          const localProjects = await this.getLocalProjects();
                          for (const folder of driveRes.files) {
                              if (folder.name === ARCHIVE_FOLDER_NAME) continue;
                              const existing = Array.from(projectMap.values()).find(p => p.id === folder.id || p.driveFolderId === folder.id || p.name === folder.name);
                              if (existing) {
                                  if (!existing.driveFolderId) existing.driveFolderId = folder.id;
                              } else {
                                  const localMatch = localProjects.find(p => p.id === folder.id || p.driveFolderId === folder.id || p.name === folder.name);
                                  const discovered: Project = localMatch || {
                                      id: folder.id,
                                      name: folder.name,
                                      driveFolderId: folder.id,
                                      location: 'الموقع الميداني',
                                      contractor: 'المقاول العام',
                                      value: '0',
                                      handoverDate: '',
                                      completionDate: '',
                                      status: ProjectStatus.IN_PROGRESS,
                                      fullDescription: '',
                                      executionLogs: [],
                                      payments: [],
                                      boqItems: []
                                  };
                                  projectMap.set(discovered.id, discovered);
                                  setDoc(doc(db, "projects", discovered.id), sanitizeForFirestore(discovered), { merge: true }).catch(() => {});
                              }
                          }
                      }
                  }
              } catch(e) {}
          }

          let list = Array.from(projectMap.values());
          if (list.some(p => p.id !== 'starter_demo_project')) {
              list = list.filter(p => p.id !== 'starter_demo_project');
              dbService.deleteItem('projects', 'starter_demo_project').catch(() => {});
          }

          if (list.length > 0) {
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
          const unsub = onSnapshot(collection(db, "projects"), async (snapshot) => {
              if (!snapshot.empty) {
                  const localProjects = await this.getLocalProjects().catch(() => []);
                  const syncProjects = this.getSyncProjects();
                  const list = snapshot.docs.map(doc => {
                      const data = doc.data() as any;
                      const localMatch = localProjects.find(p => p.id === doc.id) || syncProjects.find(p => p.id === doc.id);
                      return mergeProjectData(localMatch, enrichProjectWithAI({ id: doc.id, ...data }));
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

      const mergeAndEmit = async () => {
          if (!docData) return;
          const local = await dbService.getItem<Project>('projects', projectId).catch(() => null);
          const remoteDoc = { ...docData };
          if (logsData && logsData.length > 0) {
              remoteDoc.executionLogs = logsData;
          }
          const finalProject = enrichProjectWithAI(mergeProjectData(local || undefined, remoteDoc));
          
          await dbService.putItem('projects', finalProject).catch(() => {});
          const cachedList = this.getSyncProjects();
          const updatedList = cachedList.some(p => p.id === finalProject.id) 
              ? cachedList.map(p => p.id === finalProject.id ? finalProject : p)
              : [...cachedList, finalProject];
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, updatedList);
          updateCache('projects_list', updatedList);
          
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
              await dbService.deleteItem('projects', projectId).catch(() => {}); 
              await dbService.putItem('projects', firestoreData).catch(() => {}); 

              // Re-key local subfolders to driveFolderId
              for (let idx = 0; idx < DEFAULT_SUBFOLDERS.length; idx++) {
                  const oldSubId = `${projectId}_sub_${idx}`;
                  const newSubId = `${driveFolderId}_sub_${idx}`;
                  const folderItem = { 
                      id: newSubId, 
                      parentId: driveFolderId, 
                      name: DEFAULT_SUBFOLDERS[idx], 
                      type: ItemType.FOLDER, 
                      createdTime: new Date().toISOString(),
                      mimeType: 'application/vnd.google-apps.folder',
                      fileCount: 0,
                      folderCount: 0
                  }; 
                  await dbService.deleteItem('files', oldSubId).catch(() => {});
                  await dbService.putItem('files', folderItem).catch(() => {});
              }

              // Update sync cache & localStorage
              const currentSync = this.getSyncProjects();
              const updatedSync = deduplicateProjects(
                  currentSync.filter(p => p.id !== projectId).concat(enrichProjectWithAI(firestoreData))
              );
              saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, updatedSync);
              updateCache('projects_list', updatedSync);
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
      let existing: Project | null = null;
      try { existing = (await dbService.getItem<Project>('projects', id)) || null; } catch(e) {}
      if (!existing) {
          const syncCached = this.getSyncProjects();
          existing = syncCached.find(p => p.id === id) || null;
      }
      
      // Safeguard against accidental empty-array overwrites from unloaded tabs
      const safeUpdates: any = { ...updates };
      if (existing) {
          if (existing.boqItems && existing.boqItems.length > 0 && Array.isArray(safeUpdates.boqItems) && safeUpdates.boqItems.length === 0 && !safeUpdates._allowEmptyBoq) {
              safeUpdates.boqItems = existing.boqItems;
          }
          if (existing.payments && existing.payments.length > 0 && Array.isArray(safeUpdates.payments) && safeUpdates.payments.length === 0 && !safeUpdates._allowEmptyPayments) {
              safeUpdates.payments = existing.payments;
          }
          if (existing.executionLogs && existing.executionLogs.length > 0 && Array.isArray(safeUpdates.executionLogs) && safeUpdates.executionLogs.length === 0 && !safeUpdates._allowEmptyLogs) {
              safeUpdates.executionLogs = existing.executionLogs;
          }
          if (existing.engineeringReports && existing.engineeringReports.length > 0 && Array.isArray(safeUpdates.engineeringReports) && safeUpdates.engineeringReports.length === 0 && !safeUpdates._allowEmptyReports) {
              safeUpdates.engineeringReports = existing.engineeringReports;
          }
      }

      // Apply updates on top of existing
      const rawMerged: Project = {
          ...(existing || {}),
          ...safeUpdates,
          id,
          updatedAt: Date.now()
      } as Project;

      if (rawMerged.payments) {
          rawMerged.payments = normalizePayments(rawMerged.payments);
      }
      if (rawMerged.boqItems) {
          rawMerged.boqItems = normalizeBoqItems(rawMerged.boqItems);
      }

      const updatedProject = enrichProjectWithAI(rawMerged);

      // 1. Instant local persistence (0ms)
      try {
          await dbService.putItem('projects', updatedProject);
          const cached = this.getSyncProjects();
          const merged = cached.some(p => p.id === id) ? cached.map(p => p.id === id ? updatedProject : p) : [updatedProject, ...cached];
          saveToSyncCache(LOCAL_STORAGE_PROJECTS_KEY, merged);
          updateCache('projects_list', merged);
      } catch (e) {}

      // 2. Cloud Firestore persistence (SetDoc with merge & 1MB size guard)
      if (navigator.onLine && !authService.isGuest()) {
          try {
              const projectRef = doc(db, "projects", id);
              const safeUpdates = prepareProjectForFirestore(updatedProject);
              await setDoc(projectRef, safeUpdates, { merge: true });
              return updatedProject;
          } catch (e: any) {
              if (e.code === 'permission-denied') {
                  return updatedProject;
              }
              if (!isSyncProcess) { 
                  await syncService.addToQueue(SyncActionType.UPDATE_PROJECT, { id, updates: updatedProject }); 
              } else throw e;
          }
      } else {
          if (!isSyncProcess) { 
              await syncService.addToQueue(SyncActionType.UPDATE_PROJECT, { id, updates: updatedProject }); 
          }
      }
      return updatedProject;
  },
  async addProjectLog(projectId: string, log: ProjectLog): Promise<void> {
      if (!authService.isAuthenticated()) return;
      let newLogs: ProjectLog[] = [log];
      const now = Date.now();
      try {
          const project = await dbService.getItem<Project>('projects', projectId);
          if (project) {
              const existingLogs = project.executionLogs || [];
              const logMap = new Map<string, ProjectLog>();
              existingLogs.forEach(l => { if (l && l.id) logMap.set(l.id, l); });
              logMap.set(log.id, log);
              newLogs = Array.from(logMap.values()).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
              await dbService.putItem('projects', { ...project, executionLogs: newLogs, updatedAt: now });
          }
      } catch(e) {}

      if (navigator.onLine && !authService.isGuest()) {
          try {
              const logsRef = collection(db, "projects", projectId, "logs");
              await setDoc(doc(logsRef, log.id), sanitizeForFirestore(log));
              const projectRef = doc(db, "projects", projectId);
              const lightLogs = newLogs.map(l => ({ ...l, images: (l.images || []).filter(img => !img.startsWith('data:') || img.length < 60000) }));
              await setDoc(projectRef, { executionLogs: sanitizeForFirestore(lightLogs), updatedAt: now }, { merge: true });
          } catch (e: any) { 
              if (e.code !== 'permission-denied') {
                  console.warn("Firestore sync failed, data saved locally.");
              }
          }
      }
  },
  async updateProjectLog(projectId: string, log: ProjectLog): Promise<void> {
      if (!authService.isAuthenticated()) return;
      let newLogs: ProjectLog[] = [];
      const now = Date.now();
      try {
          const project = await dbService.getItem<Project>('projects', projectId);
          if (project && project.executionLogs) {
              newLogs = project.executionLogs.map(l => l.id === log.id ? log : l);
              await dbService.putItem('projects', { ...project, executionLogs: newLogs, updatedAt: now });
          }
      } catch(e) {}

      if (navigator.onLine && !authService.isGuest()) {
          try {
              const logRef = doc(db, "projects", projectId, "logs", log.id);
              await setDoc(logRef, sanitizeForFirestore(log), { merge: true });
              if (newLogs.length > 0) {
                  const projectRef = doc(db, "projects", projectId);
                  const lightLogs = newLogs.map(l => ({ ...l, images: (l.images || []).filter(img => !img.startsWith('data:') || img.length < 60000) }));
                  await setDoc(projectRef, { executionLogs: sanitizeForFirestore(lightLogs), updatedAt: now }, { merge: true });
              }
          } catch (e: any) { 
              if (e.code !== 'permission-denied') console.warn("Firestore sync failed"); 
          }
      }
  },
  async deleteProjectLog(projectId: string, logId: string): Promise<void> {
      if (!authService.isAuthenticated()) return;
      let newLogs: ProjectLog[] = [];
      const now = Date.now();
      try {
          const project = await dbService.getItem<Project>('projects', projectId);
          if (project && project.executionLogs) {
              newLogs = project.executionLogs.filter(l => l.id !== logId);
              await dbService.putItem('projects', { ...project, executionLogs: newLogs, updatedAt: now });
          }
      } catch(e) {}

      if (navigator.onLine && !authService.isGuest()) {
          try {
              const logRef = doc(db, "projects", projectId, "logs", logId);
              await deleteDoc(logRef);
              const projectRef = doc(db, "projects", projectId);
              const lightLogs = newLogs.map(l => ({ ...l, images: (l.images || []).filter(img => !img.startsWith('data:') || img.length < 60000) }));
              await setDoc(projectRef, { executionLogs: sanitizeForFirestore(lightLogs), updatedAt: now }, { merge: true });
          } catch (e: any) { 
              if (e.code !== 'permission-denied') console.warn("Firestore sync failed");
          }
      }
  },
  async updateProjectMasterData(id: string, data: any): Promise<any> { 
      const executionLogs = data.executionLogs || data.logs;
      const updates: any = { ...data };
      delete updates.logs;
      delete updates.newLog;
      delete updates.logDate;
      delete updates.newPaymentCumulative;
      delete updates.newPaymentNote;
      delete updates.newInvoiceNumber;
      delete updates.soilReport;
      if (executionLogs && Array.isArray(executionLogs)) {
          updates.executionLogs = executionLogs;
      }
      return this.updateProject(id, updates); 
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
      const targetId = (folderId && folderId !== 'undefined') ? folderId : await this.ensureRootFolder(); 
      
      // 1. Return memory cache immediately if fresh, while refreshing in background
      const memCached = this.getCachedContents(targetId);

      const allFiles = await dbService.getAllItems<FileItem>('files'); 
      let localChildren = allFiles.filter(f => f.parentId === targetId); 
      if (!includeSystemFolders) { localChildren = localChildren.filter(f => f.name !== ARCHIVE_FOLDER_NAME && f.name !== HIDDEN_LOGS_FOLDER); } 
      localChildren = localChildren.sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime()); 
      
      if (!navigator.onLine || authService.isGuest() || isSyntheticDriveId(targetId)) {
          return localChildren.length > 0 ? localChildren : (memCached || []); 
      }
      
      if (!memCached && localChildren.length === 0) triggerLoadingStart(); 
      
      try { 
          let query = `'${targetId}' in parents and trashed = false and name != 'metadata.json'`; 
          if (!includeSystemFolders) { query += ` and name != '${ARCHIVE_FOLDER_NAME}' and name != '${HIDDEN_LOGS_FOLDER}'`; } 
          const fields = 'files(id, name, mimeType, createdTime, webViewLink, webContentLink, thumbnailLink, size)'; 
          const result = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=folder,createdTime desc`); 
          
          const data: FileItem[] = (result.files || []).map((f: any) => ({ 
              id: f.id, 
              parentId: targetId, 
              name: f.name, 
              type: f.mimeType === 'application/vnd.google-apps.folder' ? ItemType.FOLDER : ItemType.FILE, 
              mimeType: f.mimeType, 
              createdTime: f.createdTime, 
              webViewLink: f.webViewLink, 
              previewUrl: f.thumbnailLink, 
              thumbnailLink: f.thumbnailLink,
              webContentLink: f.webContentLink, 
              fileCount: 0, 
              folderCount: 0, 
              size: f.size ? parseInt(f.size) : 0 
          })); 
          
          for (const item of data) { dbService.putItem('files', item).catch(() => {}); } 
          updateCache(targetId, data); 
          autoSync.prioritizeFolder(data);

          if (!memCached && localChildren.length === 0) triggerLoadingStop(); 
          return data; 
      } catch (e) { 
          if (!memCached && localChildren.length === 0) triggerLoadingStop(); 
          return localChildren; 
      } 
  },
  // ... rest of the file
  async enrichItemCounts(items: FileItem[]): Promise<FileItem[]> { 
      if (!navigator.onLine) return items;
      const folders = items.filter(i => i.type === ItemType.FOLDER && !isSyntheticDriveId(i.id)); 
      if (folders.length === 0) return items; 
      const updatedItems = [...items]; 
      const promises = folders.map(async (folder) => { try { const query = `'${folder.id}' in parents and trashed = false`; const res = await fetchDrive(`files?q=${encodeURIComponent(query)}&fields=files(mimeType,id)`); if (res && res.files) { const filesCount = res.files.filter((f: any) => f.mimeType !== 'application/vnd.google-apps.folder').length; const foldersCount = res.files.filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder').length; const idx = updatedItems.findIndex(i => i.id === folder.id); if (idx !== -1) { updatedItems[idx] = { ...updatedItems[idx], fileCount: filesCount, folderCount: foldersCount }; } } } catch(e) { } }); await Promise.all(promises); return updatedItems; 
  },
  async getFileMetadata(id: string): Promise<FileItem | null> { 
      if (!authService.isAuthenticated()) return null; 
      const localFile = await dbService.getItem<FileItem>('files', id);
      if (!navigator.onLine || isSyntheticDriveId(id)) { return localFile || null; }
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
