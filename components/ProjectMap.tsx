
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Project, ProjectStatus } from '../types';
import { geoUtils } from '../services/geoUtils';
import { api } from '../services/api';

// Fix for default marker icons not showing in React Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface ProjectMapProps {
    projects: Project[];
    onProjectClick: (id: string) => void;
    isFullScreen?: boolean;
    onClose?: () => void; // New prop for exit action
}

// Helper: Status Configuration
const getStatusConfig = (status: ProjectStatus) => {
    switch (status) {
        case ProjectStatus.ONGOING: return { color: '#d97706', bg: '#fef3c7', icon: 'fa-person-digging' }; // Amber
        case ProjectStatus.COMPLETED: return { color: '#059669', bg: '#ecfdf5', icon: 'fa-check' }; // Emerald
        case ProjectStatus.DESIGN: return { color: '#7c3aed', bg: '#f5f3ff', icon: 'fa-pen-ruler' }; // Violet
        case ProjectStatus.PAUSED: return { color: '#dc2626', bg: '#fef2f2', icon: 'fa-pause' }; // Red
        default: return { color: '#475569', bg: '#f8fafc', icon: 'fa-circle-question' }; // Slate
    }
};

const createCustomIcon = (status: ProjectStatus) => {
    const config = getStatusConfig(status);
    const pulseClass = status === ProjectStatus.ONGOING ? 'pin-pulse' : '';
    
    return L.divIcon({
        className: 'custom-pin',
        html: `
            <div class="pin-outer" style="background: ${config.color}; border-color: white;">
                <div class="${pulseClass}" style="background: ${config.color}"></div>
                <div class="pin-inner">
                    <i class="fa-solid ${config.icon}"></i>
                </div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40], // Point at bottom center
        popupAnchor: [0, -45]
    });
};

// --- Isolated Marker Component to fix _leaflet_pos error ---
const ProjectMarker: React.FC<{
    project: Project;
    coords: { lat: number; lng: number };
    onDragEnd: (id: string, e: any) => void;
    onProjectClick: (id: string) => void;
}> = ({ project, coords, onDragEnd, onProjectClick }) => {
    const map = useMap();
    const config = getStatusConfig(project.status);

    // Memoize handlers to prevent listener re-attachment during drag
    const eventHandlers = useMemo(() => ({
        dragend: (e: any) => {
            onDragEnd(project.id, e);
        },
        click: (e: any) => {
            map.flyTo(e.latlng, Math.max(map.getZoom(), 14), {
                animate: true,
                duration: 1.5,
                easeLinearity: 0.25
            });
        }
    }), [project.id, onDragEnd, map]);

    return (
        <Marker 
            position={[coords.lat, coords.lng]} 
            icon={createCustomIcon(project.status)}
            draggable={true} 
            eventHandlers={eventHandlers}
            autoPanOnFocus={false} // Stability fix
        >
            <Popup>
                <div className="flex flex-col gap-2 p-1 font-sans text-right" dir="rtl">
                    <div className="flex items-center justify-between border-b pb-2 mb-1" style={{borderColor: '#e2e8f0'}}>
                        <h3 className="font-bold text-sm text-slate-800 m-0">{project.name}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold text-white" style={{background: config.color}}>
                            {project.status}
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <i className="fa-solid fa-location-dot text-slate-400"></i>
                        <span>{project.location || 'غير محدد'}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                        <i className="fa-solid fa-hard-hat text-slate-400"></i>
                        <span>{project.contractor || '---'}</span>
                    </div>

                    <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{width: `${project.calculatedProgress || 0}%`, background: config.color}}></div>
                    </div>
                    <div className="flex justify-between text-[9px] text-slate-400 mt-0.5">
                        <span>إنجاز مالي</span>
                        <span>{project.calculatedProgress || 0}%</span>
                    </div>

                    <div className="text-[9px] text-blue-500 mt-1 italic text-center">
                        (اسحب الدبوس لتعديل الموقع)
                    </div>

                    <button 
                        onClick={() => onProjectClick(project.id)}
                        className="mt-2 w-full py-2 rounded-lg text-white font-bold text-xs shadow-md transition hover:opacity-90 flex items-center justify-center gap-2"
                        style={{background: '#0f172a'}}
                    >
                        <i className="fa-solid fa-folder-open"></i> فتح المشروع
                    </button>
                </div>
            </Popup>
        </Marker>
    );
};

// --- Sub-Component: MapMarkers ---
const MapMarkers: React.FC<{
    projects: Project[];
    markers: Record<string, { lat: number, lng: number }>;
    onProjectClick: (id: string) => void;
    onDragEnd: (id: string, e: any) => void;
}> = ({ projects, markers, onProjectClick, onDragEnd }) => {
    return (
        <>
            {projects.map(p => {
                const coords = markers[p.id];
                if (!coords) return null;
                return (
                    <ProjectMarker 
                        key={p.id}
                        project={p}
                        coords={coords}
                        onDragEnd={onDragEnd}
                        onProjectClick={onProjectClick}
                    />
                );
            })}
        </>
    );
};

// Component to handle map resize issues and initial bounds
const MapController: React.FC<{ coords: [number, number][], isFirstLoad: boolean }> = ({ coords, isFirstLoad }) => {
    const map = useMap();
    
    useEffect(() => {
        const timeout = setTimeout(() => {
            map.invalidateSize();
        }, 100);
        return () => clearTimeout(timeout);
    }, [map, coords]);

    useEffect(() => {
        if (isFirstLoad && coords.length > 0) {
            const bounds = L.latLngBounds(coords);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
        }
    }, [coords, map, isFirstLoad]);
    
    return null;
};

const ProjectMap: React.FC<ProjectMapProps> = ({ projects, onProjectClick, isFullScreen = false, onClose }) => {
    // Stores the effective coordinates for display
    const [markers, setMarkers] = useState<Record<string, { lat: number, lng: number }>>({});
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    
    // Map View Type State: 'street' or 'satellite'
    const [mapType, setMapType] = useState<'street' | 'satellite'>('street');

    useEffect(() => {
        let active = true;
        const loadCoords = async () => {
            const newMarkers: Record<string, { lat: number, lng: number }> = {};
            const projectsToGeocode: Project[] = [];

            // 1. First Pass: Use stored coordinates (Instant)
            projects.forEach(p => {
                if (p.lat && p.lng) {
                    newMarkers[p.id] = { lat: p.lat, lng: p.lng };
                } else {
                    projectsToGeocode.push(p);
                }
            });

            if (Object.keys(newMarkers).length > 0) {
                if(active) {
                    setMarkers(prev => ({...prev, ...newMarkers}));
                    setLoading(false);
                }
            }

            // 2. Second Pass: Geocode missing ones (Slow)
            if (projectsToGeocode.length > 0) {
                const promises = projectsToGeocode.map(async (p) => {
                    let coords;
                    if (p.location) {
                        coords = await geoUtils.getCoordinatesFromAddress(p.location);
                    } else {
                        coords = await geoUtils.getCoordinatesFromAddress('default');
                    }
                    return { id: p.id, lat: coords.lat, lng: coords.lng };
                });

                const results = await Promise.all(promises);
                if (active) {
                    const geocodedMarkers: Record<string, { lat: number, lng: number }> = {};
                    results.forEach(r => { geocodedMarkers[r.id] = { lat: r.lat, lng: r.lng }; });
                    setMarkers(prev => ({ ...prev, ...geocodedMarkers }));
                    setLoading(false);
                }
            } else {
                if(active) setLoading(false);
            }
        };

        loadCoords();
        return () => { active = false; };
    }, [projects]);

    const handleMarkerDragEnd = useCallback(async (projectId: string, event: any) => {
        const marker = event.target;
        const position = marker.getLatLng();
        
        // Update local state immediately for UI responsiveness
        setMarkers(prev => ({
            ...prev,
            [projectId]: { lat: position.lat, lng: position.lng }
        }));

        // Update Backend
        setUpdatingId(projectId);
        try {
            await api.updateProject(projectId, { lat: position.lat, lng: position.lng });
        } catch (e) {
            console.error("Failed to save location", e);
            alert("فشل حفظ الموقع الجديد. تأكد من الاتصال بالإنترنت.");
        } finally {
            setUpdatingId(null);
        }
    }, []);

    const validCoords = useMemo(() => {
        return (Object.values(markers) as { lat: number; lng: number }[]).map((c) => [c.lat, c.lng] as [number, number]);
    }, [markers]);

    if (loading && Object.keys(markers).length === 0) {
        return (
            <div className={`w-full flex flex-col items-center justify-center bg-slate-100 ${isFullScreen ? 'h-full' : 'h-[500px] rounded-3xl border border-slate-200'}`}>
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-slate-500 font-bold animate-pulse">جاري تحميل الخريطة...</p>
            </div>
        );
    }

    return (
        <div className={`relative z-0 group overflow-hidden ${isFullScreen ? 'w-full h-full' : 'w-full h-[500px] rounded-3xl shadow-inner border border-slate-300'}`}>
            
            {updatingId && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] bg-white/90 px-4 py-2 rounded-full shadow-lg text-xs font-bold text-blue-600 flex items-center gap-2 border border-blue-100 animate-fade-in">
                    <i className="fa-solid fa-circle-notch fa-spin"></i> جاري حفظ الموقع الجديد...
                </div>
            )}

            <MapContainer 
                center={[30.0444, 31.2357]} 
                zoom={6} 
                style={{ height: '100%', width: '100%' }}
                zoomControl={false} 
            >
                {/* Tile Layer Logic */}
                {mapType === 'street' ? (
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                ) : (
                    <TileLayer
                        attribution='&copy; Google Maps'
                        url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                    />
                )}
                
                <MapController coords={validCoords} isFirstLoad={true} />

                <MapMarkers 
                    projects={projects} 
                    markers={markers} 
                    onProjectClick={onProjectClick} 
                    onDragEnd={handleMarkerDragEnd} 
                />

            </MapContainer>
            
            {/* UNIFIED FLOATING CONTROL BAR (Bottom Center) - Fixed Animation Issue */}
            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-[1000] flex items-center gap-2 bg-slate-900/80 backdrop-blur-md p-1.5 rounded-full border border-white/10 shadow-2xl">
                {/* Map Type Switcher */}
                <div className="flex bg-white/10 rounded-full p-1 relative">
                    <button 
                        onClick={() => setMapType('street')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 ${mapType === 'street' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
                    >
                        <i className="fa-solid fa-map"></i> <span className="hidden sm:inline">شوارع</span>
                    </button>
                    <button 
                        onClick={() => setMapType('satellite')}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 ${mapType === 'satellite' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-300 hover:text-white'}`}
                    >
                        <i className="fa-solid fa-earth-americas"></i> <span className="hidden sm:inline">قمر صناعي</span>
                    </button>
                </div>

                {/* Separator and Exit Button (Only in Full Screen Mode) */}
                {isFullScreen && onClose && (
                    <>
                        <div className="w-px h-6 bg-white/20 mx-1"></div>
                        <button 
                            onClick={onClose} 
                            className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded-full font-bold flex items-center gap-2 transition shadow-md text-xs"
                        >
                            <i className="fa-solid fa-arrow-right rtl:rotate-180"></i> خروج
                        </button>
                    </>
                )}
            </div>

            {/* Map Legend (Bottom Right - Hidden on mobile if needed) */}
            {!isFullScreen && (
                <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-sm p-3 rounded-2xl shadow-lg z-[1000] border border-slate-200 text-xs hidden sm:block pointer-events-none">
                    <div className="space-y-1.5">
                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-600"></div><span>منتهي</span></div>
                        <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-600"></div><span>جاري</span></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProjectMap;
