import { useState, useCallback, useRef, useEffect, memo } from "react";

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGL_MAP;

const VIBES = ["🔥 Hyped", "🌿 Chill", "🎶 Lively", "💡 Hidden gem", "💸 Splurge"];

const MOCK_SPOTS = [
  { id: 1, name: "Russ & Daughters Cafe", type: "Cafe • Jewish Deli", address: "127 Orchard St, Lower East Side", distance: "12m away", emoji: "🥯", neighborhood: "LES", lat: 40.7223, lng: -73.9887 },
  { id: 2, name: "Don Angie", type: "Restaurant • Italian", address: "103 Greenwich Ave, West Village", distance: "8m away", emoji: "🍝", neighborhood: "West Village", lat: 40.7357, lng: -74.0007 },
  { id: 3, name: "Attaboy", type: "Bar • Cocktail Lounge", address: "134 Eldridge St, Lower East Side", distance: "5m away", emoji: "🍸", neighborhood: "LES", lat: 40.7181, lng: -73.9913 },
  { id: 4, name: "Superiority Burger", type: "Restaurant • Vegetarian", address: "430 E 9th St, East Village", distance: "20m away", emoji: "🍔", neighborhood: "East Village", lat: 40.7268, lng: -73.9815 },
  { id: 5, name: "The Smile", type: "Cafe • Mediterranean", address: "26 Bond St, NoHo", distance: "3m away", emoji: "☕", neighborhood: "NoHo", lat: 40.7267, lng: -73.9934 },
  { id: 6, name: "Lucali", type: "Restaurant • Pizza", address: "575 Henry St, Carroll Gardens", distance: "15m away", emoji: "🍕", neighborhood: "Brooklyn", lat: 40.6796, lng: -73.9991 },
];

const TYPE_EMOJI = {
  restaurant: "🍽️", bar: "🍸", cafe: "☕", bakery: "🥐",
  meal_takeaway: "🥡", night_club: "🎶", food: "🍴",
};

function getEmoji(types = []) {
  for (const t of types) if (TYPE_EMOJI[t]) return TYPE_EMOJI[t];
  return "📍";
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getNextMock(lastId) {
  const pool = MOCK_SPOTS.filter(s => s.id !== lastId);
  return pool[Math.floor(Math.random() * pool.length)];
}

// FIX: Haversine distance — exact meters between two GPS points
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(m) {
  if (m < 15) return "right here";
  if (m < 100) return `${Math.round(m)}m away`;
  return `${(m / 1000).toFixed(1)}km away`;
}

// FIX #9: Haptic feedback helper — light vibration on supported devices
function haptic(pattern = 10) {
  try { navigator.vibrate?.(pattern); } catch {}
}

// FIX #11: Clean up ugly neighborhood strings like "Brooklyn, NY 11201"
function cleanNeighborhood(raw) {
  if (!raw) return "NYC";
  let n = raw.trim();
  // Strip ZIP codes
  n = n.replace(/\s+\d{5}(-\d{4})?$/, "").trim();
  // Strip state abbreviations
  n = n.replace(/,?\s*(NY|NJ|CT|PA)$/i, "").trim();
  // Normalize common names
  const map = {
    "New York": "Manhattan",
    "Brooklyn": "Brooklyn",
    "Queens": "Queens",
    "Bronx": "The Bronx",
    "Staten Island": "Staten Island",
  };
  if (map[n]) return map[n];
  // Strip trailing comma junk
  n = n.replace(/^,\s*/, "").replace(/,$/, "").trim();
  return n || "NYC";
}

// FIX #2: Check if a place is currently open (from Places API opening_hours)
function isOpenNow(hours) {
  if (!hours) return null; // unknown
  if (typeof hours.isOpen === "function") {
    try { return hours.isOpen(); } catch { return null; }
  }
  if (typeof hours.open_now === "boolean") return hours.open_now;
  return null;
}


// FIX: use global callback pattern — most reliable on mobile Safari
function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.places) { resolve(); return; }

    const callbackName = "__googleMapsReady__";
    window[callbackName] = () => resolve();

    const existing = document.getElementById("gmap-script");
    if (existing) {
      const poll = setInterval(() => {
        if (window.google?.maps?.places) { clearInterval(poll); resolve(); }
      }, 150);
      setTimeout(() => { clearInterval(poll); reject(new Error("Maps timeout")); }, 12000);
      return;
    }

    const s = document.createElement("script");
    s.id = "gmap-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
    s.async = true;
    s.defer = true;
    s.onerror = () => reject(new Error("Maps failed to load"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("Maps timeout")), 12000);
  });
}

const USING_REAL_API = !!GOOGLE_API_KEY;

// FIX: NavBar moved OUTSIDE SpotDrop so it's never recreated on parent re-render
// FIX: memo() prevents unnecessary re-renders
const NavBar = memo(({ screen, setScreen }) => (
  <div style={{
    position: "fixed", bottom: 0, left: 0, right: 0,
    background: "#0d0d0d", borderTop: "1px solid #1e1e1e",
    display: "flex", padding: "10px 0 24px",
    zIndex: 100,
  }}>
    {[
      { id: "home", icon: "📍", label: "Pin" },
      { id: "saved", icon: "🗒️", label: "List" },
      { id: "map", icon: "🗺️", label: "Map" },
      { id: "install", icon: "📱", label: "Install" },
    ].map(tab => (
      <button key={tab.id} onClick={() => setScreen(tab.id)} style={{
        flex: 1, background: "none", border: "none", cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
        opacity: screen === tab.id ? 1 : 0.35,
        transition: "opacity 0.2s",
      }}>
        <span style={{ fontSize: 22 }}>{tab.icon}</span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: screen === tab.id ? "#e8c547" : "#888", letterSpacing: 0.5 }}>{tab.label}</span>
      </button>
    ))}
  </div>
));

// ─── MAP COMPONENT ─────────────────────────────────────────────────────────────
const MapView = memo(function MapView({ spots, onSpotClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [userLocation, setUserLocation] = useState(null);

  useEffect(() => {
    if (!USING_REAL_API) { setMapError(true); return; }
    loadGoogleMaps(GOOGLE_API_KEY)
      .then(() => setMapReady(true))
      .catch(() => setMapError(true));
  }, []);

  // FIX: get user's current location once when map loads
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}, // silently fail — map will just center on spots instead
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Init map once
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInstanceRef.current) return;
    const center = userLocation
      || (spots.length ? { lat: spots[0].lat || 40.7268, lng: spots[0].lng || -73.9815 } : { lat: 40.7268, lng: -73.9815 });

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center, zoom: 14,
      styles: [
        { elementType: "geometry", stylers: [{ color: "#1a1a1a" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#888" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#0a0a0a" }] },
        { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2a2a" }] },
        { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#333" }] },
        { featureType: "water", elementType: "geometry", stylers: [{ color: "#111" }] },
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
      disableDefaultUI: true, zoomControl: true,
    });
  }, [mapReady, userLocation]);

  // Draw the user's location as a blue dot + center on them
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || !userLocation) return;

    if (userMarkerRef.current) userMarkerRef.current.setMap(null);
    userMarkerRef.current = new window.google.maps.Marker({
      position: userLocation,
      map: mapInstanceRef.current,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#4285f4",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
      zIndex: 999,
      title: "You are here",
    });

    // Center map on user location on first load
    mapInstanceRef.current.setCenter(userLocation);
    mapInstanceRef.current.setZoom(15);
  }, [mapReady, userLocation]);

  // Render saved spot markers
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const validSpots = spots.filter(s => s.lat && s.lng);
    validSpots.forEach(spot => {
      const marker = new window.google.maps.Marker({
        position: { lat: spot.lat, lng: spot.lng },
        map: mapInstanceRef.current,
        title: spot.name,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: "#e8c547",
          fillOpacity: 1,
          strokeColor: "#0a0a0a",
          strokeWeight: 2,
        },
      });
      marker.addListener("click", () => onSpotClick(spot));
      markersRef.current.push(marker);
    });
  }, [mapReady, spots, onSpotClick]);

  // Recenter button handler
  const recenterOnMe = () => {
    if (!userLocation || !mapInstanceRef.current) return;
    mapInstanceRef.current.panTo(userLocation);
    mapInstanceRef.current.setZoom(15);
  };

  if (mapError) {
    return (
      <div style={{
        flex: 1, background: "#111", borderRadius: 20,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        border: "1px solid #2a2a2a", gap: 12, padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 36 }}>🗺️</div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#555", lineHeight: 1.6 }}>
          {USING_REAL_API ? "Map failed to load. Check your API key." : "Map needs your Google API key."}
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "400px" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%", borderRadius: 20, overflow: "hidden" }} />

      {/* Recenter-on-me button */}
      {userLocation && (
        <button onClick={recenterOnMe} style={{
          position: "absolute", bottom: 16, right: 16,
          width: 48, height: 48, borderRadius: "50%",
          background: "#141414", border: "1px solid #2a2a2a",
          color: "#f5f0e8", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
        }} title="Center on my location">📍</button>
      )}
    </div>
  );
});

// ─── SWIPEABLE CANDIDATE STACK ─────────────────────────────────────────────────
function CandidateStack({ candidates, onPick, onCancel }) {
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exitDir, setExitDir] = useState(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const axisRef = useRef(null);

  const current = candidates[index];
  const isFirst = index === 0;
  const isLast = index >= candidates.length;

  // FIX: lazy photo — only build URL for the card currently visible (saves API quota)
  const [photoSrc, setPhotoSrc] = useState(null);
  const [photoLoading, setPhotoLoading] = useState(false);

  useEffect(() => {
    setPhotoSrc(null);
    if (!current || !current.photoRef) return;
    setPhotoLoading(true);
    try {
      const url = current.photoRef.getUrl({ maxWidth: 600, maxHeight: 400 });
      setPhotoSrc(url);
    } catch (e) {
      setPhotoSrc(null);
    }
  }, [current]);

  const resetDrag = () => {
    setDragX(0);
    setExitDir(null);
    axisRef.current = null;
  };

  const handleStart = (x, y) => {
    setDragging(true);
    startXRef.current = x;
    startYRef.current = y;
    axisRef.current = null;
  };
  const handleMove = (x, y) => {
    if (!dragging) return;
    const dx = x - startXRef.current;
    const dy = y - startYRef.current;
    if (!axisRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    }
    if (axisRef.current === "x") setDragX(dx);
  };
  const handleEnd = () => {
    if (!dragging) return;
    setDragging(false);
    const threshold = 80;
    if (dragX > threshold) {
      setExitDir("right");
      setTimeout(() => onPick(current), 220);
    } else if (dragX < -threshold) {
      setExitDir("left");
      setTimeout(() => { setIndex(i => i + 1); resetDrag(); }, 220);
    } else {
      setDragX(0);
      axisRef.current = null;
    }
  };

  const goBack = () => {
    if (isFirst) return;
    setIndex(i => Math.max(0, i - 1));
    resetDrag();
  };
  const goForward = () => {
    setExitDir("left");
    setTimeout(() => { setIndex(i => i + 1); resetDrag(); }, 220);
  };
  const goPick = () => {
    setExitDir("right");
    setTimeout(() => onPick(current), 220);
  };

  if (isLast) {
    return (
      <div style={{ textAlign: "center", animation: "fadeIn 0.4s ease", padding: "0 20px", width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🤷</div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#666", lineHeight: 1.7, marginBottom: 20 }}>
          That's all the nearby spots.<br />Want to go back or cancel?
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => setIndex(i => Math.max(0, i - 1))} style={{
            flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a",
            color: "#f5f0e8", borderRadius: 14, padding: "12px 20px",
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer",
          }}>← Back</button>
          <button onClick={onCancel} style={{
            flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a",
            color: "#888", borderRadius: 14, padding: "12px 20px",
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer",
          }}>Done</button>
        </div>
      </div>
    );
  }

  const rotation = dragX / 20;
  const cardOpacity = 1 - Math.min(Math.abs(dragX) / 250, 0.4);

  let exitTransform = "";
  if (exitDir === "right") exitTransform = "translateX(420px) rotate(22deg)";
  else if (exitDir === "left") exitTransform = "translateX(-420px) rotate(-22deg)";

  return (
    <div style={{ width: "100%", maxWidth: 360, animation: "fadeIn 0.4s ease" }}>
      {/* Header with back button + counter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={goBack} disabled={isFirst} style={{
          background: "none", border: "1px solid " + (isFirst ? "#1a1a1a" : "#2a2a2a"),
          borderRadius: 20, padding: "6px 12px",
          fontFamily: "'DM Sans', sans-serif", fontSize: 12,
          color: isFirst ? "#333" : "#888",
          cursor: isFirst ? "default" : "pointer",
        }}>← Back</button>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#555", letterSpacing: 2, textTransform: "uppercase" }}>
          {index + 1} / {candidates.length}
        </span>
        <div style={{ width: 72 }} /> {/* spacer for symmetry */}
      </div>

      {/* Card */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <div
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleEnd}
          style={{
            background: "#141414", border: "1px solid #252525",
            borderRadius: 22, overflow: "hidden",
            transform: exitDir ? exitTransform : `translateX(${dragX}px) rotate(${rotation}deg)`,
            transition: dragging ? "none" : "transform 0.25s ease, opacity 0.2s ease",
            opacity: exitDir ? 0 : cardOpacity,
            cursor: dragging ? "grabbing" : "grab",
            userSelect: "none",
            touchAction: "pan-y",
            position: "relative",
          }}
        >
          {/* Photo */}
          <div style={{
            width: "100%", height: 160,
            background: "#0a0a0a",
            display: "flex", alignItems: "center", justifyContent: "center",
            position: "relative", overflow: "hidden",
          }}>
            {photoSrc ? (
              <img
                src={photoSrc}
                alt={current.name}
                draggable={false}
                style={{
                  width: "100%", height: "100%",
                  objectFit: "cover",
                  pointerEvents: "none",
                }}
                onError={() => setPhotoSrc(null)}
              />
            ) : (
              <div style={{ fontSize: 56, opacity: 0.3 }}>{current.emoji}</div>
            )}

            {/* Swipe hints overlaid on the photo */}
            {dragX > 30 && (
              <div style={{
                position: "absolute", top: 16, left: 16,
                border: "3px solid #4a9a4a", color: "#4a9a4a",
                padding: "6px 14px", borderRadius: 10,
                fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16,
                transform: "rotate(-12deg)",
                opacity: Math.min(dragX / 120, 1),
                textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                background: "rgba(0,0,0,0.4)",
              }}>✓ PICK</div>
            )}
            {dragX < -30 && (
              <div style={{
                position: "absolute", top: 16, right: 16,
                border: "3px solid #c06060", color: "#c06060",
                padding: "6px 14px", borderRadius: 10,
                fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 16,
                transform: "rotate(12deg)",
                opacity: Math.min(Math.abs(dragX) / 120, 1),
                textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                background: "rgba(0,0,0,0.4)",
              }}>✕ SKIP</div>
            )}
          </div>

          {/* Content */}
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <span style={{ fontSize: 32 }}>{current.emoji}</span>
              <span style={{ background: "#1e1e1e", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: "#e8c547" }}>
                {current.distance}
              </span>
            </div>
            <h2 style={{ fontSize: 20, marginBottom: 4, lineHeight: 1.2 }}>{current.name}</h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#666", marginBottom: 4, textTransform: "capitalize" }}>{current.type}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#444" }}>{current.address}</p>
          </div>
        </div>
      </div>

      {/* Button controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        <button onClick={goForward} style={{
          flex: 1, padding: 14, borderRadius: 14,
          background: "#1a1a1a", border: "1px solid #2a2a2a",
          color: "#888", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer",
        }}>✕ Skip</button>
        <button onClick={goPick} style={{
          flex: 1, padding: 14, borderRadius: 14,
          background: "#e8c547", border: "none",
          color: "#0a0a0a", fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer",
        }}>📍 This one</button>
      </div>

      <button onClick={onCancel} style={{
        width: "100%", padding: 10, borderRadius: 14,
        background: "none", border: "none",
        color: "#444", fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer",
      }}>Cancel</button>

      <p style={{
        textAlign: "center", marginTop: 6,
        fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#333",
      }}>Swipe left/right • Tap Back to revisit</p>
    </div>
  );
}

// Shared menu button style
const menuBtn = {
  display: "block", width: "100%", textAlign: "left",
  padding: "10px 12px", borderRadius: 8,
  background: "none", border: "none",
  color: "#ddd", fontFamily: "'DM Sans', sans-serif", fontSize: 13,
  cursor: "pointer",
};

// ─── TAG EDITOR MODAL ──────────────────────────────────────────────────────────
function TagEditor({ spot, onSave, onClose }) {
  const [tags, setTags] = useState(spot.tags || []);
  const [input, setInput] = useState("");

  const addTag = () => {
    const t = input.trim().toLowerCase();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setInput("");
    haptic(5);
  };

  const removeTag = (t) => {
    setTags(tags.filter(x => x !== t));
    haptic(5);
  };

  const suggested = ["date night", "brunch", "group", "cozy", "quick bite", "splurge", "cheap eats"];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      zIndex: 200, animation: "fadeIn 0.2s ease",
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", maxWidth: 500,
        background: "#141414", borderTop: "1px solid #2a2a2a",
        borderRadius: "20px 20px 0 0",
        padding: "28px 24px 40px",
        animation: "slideUp 0.25s ease",
      }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ width: 40, height: 4, background: "#333", borderRadius: 2, margin: "0 auto 16px" }} />
          <h2 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 22, fontStyle: "italic" }}>Edit tags</h2>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#555", marginTop: 4 }}>{spot.name}</p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <input
            type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTag()}
            placeholder="Add a tag..."
            autoFocus
            style={{
              flex: 1, background: "#0a0a0a", border: "1px solid #2a2a2a",
              borderRadius: 10, padding: "10px 14px", color: "#f5f0e8",
              fontFamily: "'DM Sans', sans-serif", fontSize: 14, outline: "none",
            }}
          />
          <button onClick={addTag} style={{
            padding: "10px 16px", borderRadius: 10,
            background: "#e8c547", border: "none", color: "#0a0a0a",
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}>Add</button>
        </div>

        {tags.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Your tags</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tags.map(t => (
                <button key={t} onClick={() => removeTag(t)} style={{
                  background: "#e8c547", color: "#0a0a0a",
                  border: "none", borderRadius: 20, padding: "6px 12px",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer",
                }}>#{t} ✕</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#555", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Suggestions</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {suggested.filter(s => !tags.includes(s)).map(s => (
              <button key={s} onClick={() => { setTags([...tags, s]); haptic(5); }} style={{
                background: "#1a1a1a", color: "#888",
                border: "1px solid #2a2a2a", borderRadius: 20, padding: "6px 12px",
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, cursor: "pointer",
              }}>+ {s}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: 12, borderRadius: 12,
            background: "none", border: "1px solid #2a2a2a",
            color: "#888", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer",
          }}>Cancel</button>
          <button onClick={() => onSave(tags)} style={{
            flex: 2, padding: 12, borderRadius: 12,
            background: "#e8c547", border: "none", color: "#0a0a0a",
            fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}>Save tags</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ──────────────────────────────────────────────────────────────────
export default function SpotDrop() {
  const [screen, setScreen] = useState("home");
  const [detected, setDetected] = useState(null);
  // FIX: persist saved spots to localStorage so they survive refresh / phone restart
  const [savedSpots, setSavedSpots] = useState(() => {
    try {
      const stored = localStorage.getItem("spotdrop_saved");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      // localStorage unavailable (private browsing, etc.) — fall through to empty
    }
    return []; // Start with empty list — no more mock spots
  });
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [saveAnim, setSaveAnim] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState(null);
  const [note, setNote] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [filter, setFilter] = useState("All");
  const [gpsStatus, setGpsStatus] = useState("idle");
  // NEW: list-screen features
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date"); // "date" | "distance" | "name"
  const [tab, setTab] = useState("all"); // "all" | "wishlist" | "visited"
  const [nearMe, setNearMe] = useState(false);
  const [userPos, setUserPos] = useState(null); // for near-me + distance sort
  const [actionMenu, setActionMenu] = useState(null); // spot id with menu open
  const [tagEditor, setTagEditor] = useState(null); // spot being edited
  const [candidates, setCandidates] = useState([]); // FIX: list of nearby places to pick from

  const detectTimerRef = useRef(null);
  const lastDetectedIdRef = useRef(null);
  // FIX: track all timeouts for cleanup on unmount
  const timeoutsRef = useRef([]);

  const safeTimeout = useCallback((fn, delay) => {
    const id = setTimeout(fn, delay);
    timeoutsRef.current.push(id);
    return id;
  }, []);

  useEffect(() => {
    return () => {
      // FIX: clear all timeouts on unmount to prevent memory leaks
      timeoutsRef.current.forEach(clearTimeout);
      if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    };
  }, []);

  // FIX: persist savedSpots to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("spotdrop_saved", JSON.stringify(savedSpots));
    } catch (e) {
      // localStorage full or unavailable — silently fail
    }
  }, [savedSpots]);

  // ── Helper to build a spot from a Places result ───────────────────────────
  const buildSpot = useCallback((place, userLat, userLng) => {
    const placeLat = place.geometry.location.lat();
    const placeLng = place.geometry.location.lng();
    const meters = distanceMeters(userLat, userLng, placeLat, placeLng);
    const typeLabel = (place.types || [])
      .filter(t => !["point_of_interest", "establishment", "food"].includes(t))
      .slice(0, 2)
      .map(t => t.replace(/_/g, " "))
      .join(" • ");
    // FIX: store the photo REFERENCE (not URL) — URL is built lazily when the card is shown
    // This saves API photo-fetch quota: only cards actually viewed load an image
    const photoRef = place.photos?.[0] || null;
    return {
      id: place.place_id,
      name: place.name,
      type: typeLabel || "Restaurant",
      address: place.vicinity,
      distance: formatDistance(meters),
      distanceMeters: meters,
      emoji: getEmoji(place.types),
      neighborhood: cleanNeighborhood(place.vicinity?.split(",").pop()),
      lat: placeLat,
      lng: placeLng,
      photoRef,
      openingHours: place.opening_hours ? { open_now: isOpenNow(place.opening_hours) } : null,
    };
  }, []);

  const selectCandidate = useCallback((spot) => {
    setDetected(spot);
    setCandidates([]);
    setGpsStatus("done");
    setSelectedVibe(null);
    setNote("");
  }, []);

  // ── Real GPS + Places detection ────────────────────────────────────────────
  const detectReal = useCallback(async () => {
    haptic(10);
    setGpsStatus("locating");
    setDetected(null);
    setCandidates([]);
    setSaveAnim(false);
    setAlreadySaved(false);

    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    try {
      // FIX: enableHighAccuracy for much better precision
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      setGpsStatus("searching");

      await loadGoogleMaps(GOOGLE_API_KEY);
      const service = new window.google.maps.places.PlacesService(document.createElement("div"));

      const runSearch = (radius, onDone) => {
        service.nearbySearch({
          location: { lat, lng },
          radius,
          type: "restaurant",
        }, (results, status) => {
          if (status === "OK" && results?.length) {
            onDone(results);
          } else {
            // Widen to bars/cafes
            service.nearbySearch({
              location: { lat, lng },
              radius: radius * 2,
              keyword: "bar cafe restaurant bakery",
            }, (results2, status2) => {
              if (status2 === "OK" && results2?.length) onDone(results2);
              else onDone([]);
            });
          }
        });
      };

      runSearch(80, (results) => {
        if (!results.length) { setGpsStatus("error"); return; }
        // Sort by actual distance and take top 10 — user can swipe through
        const spots = results
          .map(p => buildSpot(p, lat, lng))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)
          .slice(0, 10);
        setCandidates(spots);
        setGpsStatus("done");
      });
    } catch (e) {
      setGpsStatus("error");
    }
  }, [buildSpot, selectCandidate]);

  // ── Mock detection ─────────────────────────────────────────────────────────
  const detectMock = useCallback(() => {
    haptic(10);
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    setGpsStatus("locating");
    setDetected(null);
    setSaveAnim(false);
    setAlreadySaved(false);

    detectTimerRef.current = setTimeout(() => {
      setGpsStatus("searching");
      detectTimerRef.current = setTimeout(() => {
        const spot = getNextMock(lastDetectedIdRef.current);
        lastDetectedIdRef.current = spot.id;
        setDetected(spot);
        setGpsStatus("done");
        setSelectedVibe(null);
        setNote("");
        detectTimerRef.current = null;
      }, 900);
    }, 900);
  }, []);

  const detectSpot = USING_REAL_API ? detectReal : detectMock;

  const saveSpot = useCallback(() => {
    if (!detected) return;
    const already = savedSpots.find(s => s.id === detected.id);
    if (already) {
      setAlreadySaved(true);
      safeTimeout(() => setAlreadySaved(false), 2000);
      return;
    }
    haptic(15);
    setSaveAnim(true);
    const savedVibe = selectedVibe;
    const savedNote = note;
    safeTimeout(() => {
      // FIX: resolve photo URL at save time (photoRef is a live object that won't survive localStorage)
      let resolvedPhotoUrl = detected.photoUrl || null;
      if (!resolvedPhotoUrl && detected.photoRef) {
        try { resolvedPhotoUrl = detected.photoRef.getUrl({ maxWidth: 800, maxHeight: 500 }); } catch {}
      }
      const spotToSave = {
        ...detected,
        savedAt: Date.now(),
        vibe: savedVibe,
        note: savedNote,
        photoUrl: resolvedPhotoUrl,
        photoRef: undefined, // strip live ref before persisting
        status: "wishlist",  // #1: default to wishlist, can toggle to visited
        tags: [],            // #6: user-defined tags
        openNow: detected.openingHours?.open_now ?? null,
      };
      setSavedSpots(prev => [spotToSave, ...prev]);
      setDetected(null);
      setSaveAnim(false);
      setGpsStatus("idle");
      setJustSaved(true);
      safeTimeout(() => setJustSaved(false), 2500);
    }, 600);
  }, [detected, savedSpots, selectedVibe, note, safeTimeout]);

  const skipSpot = useCallback(() => {
    setSaveAnim(false);
    setDetected(null);
    setCandidates([]);
    setAlreadySaved(false);
    setGpsStatus("idle");
  }, []);

  const deleteSpot = useCallback((id) => {
    haptic(20);
    setSavedSpots(prev => prev.filter(s => s.id !== id));
    setSelectedSpot(null);
    setActionMenu(null);
    setScreen("saved");
  }, []);

  // NEW #1: toggle between wishlist and visited
  const toggleVisited = useCallback((id) => {
    haptic(10);
    setSavedSpots(prev => prev.map(s =>
      s.id === id
        ? { ...s, status: s.status === "visited" ? "wishlist" : "visited" }
        : s
    ));
  }, []);

  // NEW #6: update tags on a spot
  const updateTags = useCallback((id, tags) => {
    setSavedSpots(prev => prev.map(s => s.id === id ? { ...s, tags } : s));
  }, []);

  // NEW #7: share a spot via native share sheet
  const shareSpot = useCallback((spot) => {
    haptic(10);
    const mapsLink = spot.id && typeof spot.id === "string" && spot.id.startsWith("Ch")
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name + " " + (spot.address || ""))}&query_place_id=${spot.id}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name + " " + (spot.address || ""))}`;
    const text = `${spot.emoji} ${spot.name}\n${spot.address || ""}\n${mapsLink}`;
    if (navigator.share) {
      navigator.share({ title: spot.name, text, url: mapsLink }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text);
      alert("Link copied to clipboard!");
    }
    setActionMenu(null);
  }, []);

  // NEW #3: grab user location for "near me" filtering
  const fetchUserPos = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }, []);

  // Auto-fetch user location when they open the saved list
  useEffect(() => {
    if (screen === "saved" && !userPos) fetchUserPos();
  }, [screen, userPos, fetchUserPos]);

  // FIX: keep selectedSpot fresh by deriving it from savedSpots on every render
  // This way toggleVisited/updateTags/etc. reflect immediately in the detail view
  const liveSelectedSpot = selectedSpot
    ? (savedSpots.find(s => s.id === selectedSpot.id) || selectedSpot)
    : null;

  // FIX: stable reference so MapView markers effect doesn't re-run on every render
  const handleMapSpotClick = useCallback((spot) => {
    setSelectedSpot(spot);
    setScreen("detail");
  }, []);

  const existingNeighborhoods = Array.from(new Set(savedSpots.map(s => s.neighborhood)));
  const neighborhoods = ["All", ...existingNeighborhoods];
  const activeFilter = existingNeighborhoods.includes(filter) ? filter : "All";

  // NEW: richer filtering pipeline
  const filteredSpots = (() => {
    let list = [...savedSpots];

    // Tab filter: all / wishlist / visited
    if (tab === "wishlist") list = list.filter(s => (s.status || "wishlist") === "wishlist");
    if (tab === "visited") list = list.filter(s => s.status === "visited");

    // Neighborhood chip
    if (activeFilter !== "All") list = list.filter(s => s.neighborhood === activeFilter);

    // Search query (name, note, tags, neighborhood)
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(s =>
        s.name?.toLowerCase().includes(q) ||
        s.note?.toLowerCase().includes(q) ||
        s.neighborhood?.toLowerCase().includes(q) ||
        s.type?.toLowerCase().includes(q) ||
        (s.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    // Near-me: within 1km of user
    if (nearMe && userPos) {
      list = list
        .filter(s => s.lat && s.lng)
        .map(s => ({ ...s, _dist: distanceMeters(userPos.lat, userPos.lng, s.lat, s.lng) }))
        .filter(s => s._dist < 1000)
        .sort((a, b) => a._dist - b._dist);
    }

    // Sort
    if (!nearMe) {
      if (sortBy === "distance" && userPos) {
        list = list
          .map(s => ({ ...s, _dist: s.lat ? distanceMeters(userPos.lat, userPos.lng, s.lat, s.lng) : Infinity }))
          .sort((a, b) => a._dist - b._dist);
      } else if (sortBy === "name") {
        list.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        list.sort((a, b) => b.savedAt - a.savedAt); // date desc
      }
    }

    return list;
  })();
  const isDetecting = gpsStatus === "locating" || gpsStatus === "searching";

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a",
      fontFamily: "'DM Serif Display', Georgia, serif",
      color: "#f5f0e8", overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { display: none; }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes slideUp {
          from { transform: translateY(24px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pinDrop {
          0% { transform: translateY(-16px) scale(0.85); opacity: 0; }
          65% { transform: translateY(3px) scale(1.03); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        @keyframes saveFlash {
          0% { transform: scale(1); }
          40% { transform: scale(0.95); background: #e8c547 !important; color: #0a0a0a !important; }
          100% { transform: scale(1); }
        }
        @keyframes fadeOut { to { opacity: 0; transform: translateY(-8px); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .detected-card { animation: pinDrop 0.45s cubic-bezier(.22,1,.36,1) both; }
        .save-flash { animation: saveFlash 0.6s ease both; }
        .spot-row { animation: slideUp 0.3s ease both; transition: background 0.15s; }
        .spot-row:active { background: #1a1a1a !important; }
        .toast { animation: slideUp 0.35s ease both, fadeOut 0.4s ease 1.9s both; }
        .warn-toast { animation: slideUp 0.3s ease both, fadeOut 0.4s ease 1.4s both; }
        .pulse-ring { position: absolute; border-radius: 50%; border: 2px solid #e8c547; animation: pulseRing 1.4s ease-out infinite; }
        .detect-btn { transition: transform 0.15s ease; }
        .detect-btn:active { transform: scale(0.95) !important; }
        .nav-btn { transition: all 0.18s ease; cursor: pointer; }
        .nav-btn:active { transform: scale(0.93); }
        .vibe-pill { transition: all 0.15s ease; cursor: pointer; }
        .vibe-pill:active { transform: scale(0.94); }
        .filter-chip { transition: all 0.15s; cursor: pointer; }
        textarea { resize: none; outline: none; }
        .install-step { animation: slideUp 0.4s ease both; }
      `}</style>

      {/* Toasts */}
      {justSaved && (
        <div className="toast" style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "#e8c547", color: "#0a0a0a", padding: "10px 22px",
          borderRadius: 30, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14,
          zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 24px rgba(232,197,71,0.45)",
        }}>✓ Spot dropped!</div>
      )}
      {alreadySaved && (
        <div className="warn-toast" style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "#222", color: "#f5f0e8", padding: "10px 22px",
          borderRadius: 30, fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 14,
          zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>📍 Already in your list!</div>
      )}

      {/* ── HOME ── */}
      {screen === "home" && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", paddingBottom: 80 }}>
          <div style={{ padding: "52px 28px 20px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, letterSpacing: 3, color: "#666", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", marginBottom: 4 }}>
                {USING_REAL_API ? "📡 Live GPS" : "🧪 Demo mode"}
              </div>
              <h1 style={{ fontSize: 34, lineHeight: 1.1, fontStyle: "italic" }}>Drop<br />a Spot.</h1>
            </div>
            <button onClick={() => setScreen("saved")} className="nav-btn" style={{
              background: "none", border: "1px solid #222",
              borderRadius: 14, padding: "8px 14px",
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#888",
              textAlign: "right", marginTop: 4, cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}>
              <div style={{ fontSize: 22 }}>📍</div>
              <div>{savedSpots.length} saved</div>
            </button>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 28px 20px" }}>
            {!isDetecting && !detected && !candidates.length && gpsStatus !== "error" && (
              <div style={{ textAlign: "center", animation: "fadeIn 0.4s ease" }}>
                <button className="detect-btn" onClick={detectSpot} style={{
                  width: 164, height: 164, borderRadius: "50%",
                  background: "#e8c547", border: "none", cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 0 18px rgba(232,197,71,0.07), 0 0 0 36px rgba(232,197,71,0.03)", gap: 6,
                }}>
                  <span style={{ fontSize: 44 }}>📍</span>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: "#0a0a0a", letterSpacing: 1.5, textTransform: "uppercase" }}>Tap to Pin</span>
                </button>
                <p style={{ marginTop: 28, fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#444", lineHeight: 1.7, maxWidth: 210 }}>
                  Walk by something good?<br />Tap and we'll grab it.
                </p>
              </div>
            )}

            {isDetecting && (
              <div style={{ textAlign: "center", animation: "fadeIn 0.3s ease" }}>
                <div style={{ position: "relative", width: 130, height: 130, margin: "0 auto 24px" }}>
                  <div className="pulse-ring" style={{ width: 82, height: 82, top: 24, left: 24 }} />
                  <div className="pulse-ring" style={{ width: 82, height: 82, top: 24, left: 24, animationDelay: "0.55s" }} />
                  <div style={{
                    width: 82, height: 82, borderRadius: "50%",
                    background: "#141414", border: "2px solid #2a2a2a",
                    position: "absolute", top: 24, left: 24,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34,
                  }}>📡</div>
                </div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#555", fontSize: 13 }}>
                  {gpsStatus === "locating" ? "Getting your location..." : "Finding what's nearby..."}
                </p>
              </div>
            )}

            {gpsStatus === "error" && (
              <div style={{ textAlign: "center", animation: "fadeIn 0.3s ease", padding: "0 20px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#666", lineHeight: 1.7, marginBottom: 20 }}>
                  Couldn't detect nearby spots.<br />
                  {!navigator.geolocation ? "Location not supported on this browser." : "Check your location permissions in Settings."}
                </p>
                <button className="nav-btn" onClick={() => setGpsStatus("idle")} style={{
                  background: "#1a1a1a", border: "1px solid #2a2a2a",
                  color: "#f5f0e8", borderRadius: 14, padding: "12px 24px",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                }}>Try again</button>
              </div>
            )}

            {/* Swipeable card stack — one at a time, swipe/skip through nearby spots */}
            {candidates.length > 0 && !detected && !isDetecting && (
              <CandidateStack
                candidates={candidates}
                onPick={selectCandidate}
                onCancel={skipSpot}
              />
            )}

            {detected && !isDetecting && (
              <div className="detected-card" style={{ width: "100%", maxWidth: 360 }}>
                <div style={{ background: "#141414", border: "1px solid #252525", borderRadius: 22, padding: 22, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <span style={{ fontSize: 42 }}>{detected.emoji}</span>
                    <span style={{ background: "#1e1e1e", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontFamily: "'DM Sans', sans-serif", color: "#666" }}>{detected.distance}</span>
                  </div>
                  <h2 style={{ fontSize: 21, marginBottom: 4, lineHeight: 1.2 }}>{detected.name}</h2>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#666", marginBottom: 4, textTransform: "capitalize" }}>{detected.type}</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#444" }}>{detected.address}</p>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#444", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 10 }}>Vibe</p>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {VIBES.map(v => (
                      <button key={v} className="vibe-pill" onClick={() => setSelectedVibe(v === selectedVibe ? null : v)} style={{
                        background: selectedVibe === v ? "#e8c547" : "#181818",
                        color: selectedVibe === v ? "#0a0a0a" : "#777",
                        border: "1px solid " + (selectedVibe === v ? "#e8c547" : "#2a2a2a"),
                        borderRadius: 20, padding: "6px 12px",
                        fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                      }}>{v}</button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 18 }}>
                  <textarea value={note} onChange={e => setNote(e.target.value)}
                    placeholder="Quick note... (optional)" rows={2}
                    style={{
                      width: "100%", background: "#141414",
                      border: "1px solid #2a2a2a", borderRadius: 12,
                      padding: "10px 14px", color: "#f5f0e8",
                      fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={skipSpot} style={{
                    flex: 1, padding: 14, borderRadius: 14,
                    background: "none", border: "1px solid #222",
                    color: "#444", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer",
                  }}>Skip</button>
                  <button className={saveAnim ? "save-flash" : ""} onClick={saveSpot} style={{
                    flex: 2, padding: 14, borderRadius: 14,
                    background: "#e8c547", border: "none",
                    color: "#0a0a0a", fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, cursor: "pointer",
                  }}>📍 Drop it</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SAVED ── */}
      {screen === "saved" && (
        <div style={{ minHeight: "100vh", paddingBottom: 80 }}>
          <div style={{ padding: "52px 28px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", marginBottom: 4 }}>Your spots</div>
            <h1 style={{ fontSize: 32, fontStyle: "italic" }}>The List.</h1>
          </div>

          {/* NEW #1: Wishlist / Visited tabs */}
          {savedSpots.length > 0 && (
            <div style={{ padding: "0 28px 12px", display: "flex", gap: 6 }}>
              {[
                { id: "all", label: "All", emoji: "📚" },
                { id: "wishlist", label: "Wishlist", emoji: "🎯" },
                { id: "visited", label: "Visited", emoji: "✓" },
              ].map(t => (
                <button key={t.id} onClick={() => { haptic(5); setTab(t.id); }} style={{
                  flex: 1, padding: "8px 10px", borderRadius: 12,
                  background: tab === t.id ? "#e8c547" : "#141414",
                  border: "1px solid " + (tab === t.id ? "#e8c547" : "#222"),
                  color: tab === t.id ? "#0a0a0a" : "#888",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: tab === t.id ? 600 : 400,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                }}>
                  <span>{t.emoji}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          )}

          {/* NEW #4: Search bar */}
          {savedSpots.length > 0 && (
            <div style={{ padding: "0 28px 10px", position: "relative" }}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, note, tag..."
                style={{
                  width: "100%",
                  background: "#141414",
                  border: "1px solid #222",
                  borderRadius: 12,
                  padding: "10px 36px 10px 14px",
                  color: "#f5f0e8",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13,
                  outline: "none",
                }}
              />
              <span style={{
                position: "absolute", right: 40, top: "50%", transform: "translateY(-50%)",
                color: "#444", fontSize: 14, pointerEvents: "none",
              }}>🔍</span>
              {search && (
                <button onClick={() => setSearch("")} style={{
                  position: "absolute", right: 34, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 14,
                }}>✕</button>
              )}
            </div>
          )}

          {/* NEW #3 + #4: Near-me toggle + sort picker */}
          {savedSpots.length > 0 && (
            <div style={{ padding: "0 28px 12px", display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => { haptic(5); setNearMe(n => !n); }} style={{
                background: nearMe ? "#e8c547" : "#141414",
                color: nearMe ? "#0a0a0a" : "#888",
                border: "1px solid " + (nearMe ? "#e8c547" : "#222"),
                borderRadius: 20, padding: "6px 12px",
                fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: nearMe ? 600 : 400,
                cursor: "pointer",
              }}>📍 Near me</button>

              {!nearMe && (
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{
                  background: "#141414", border: "1px solid #222",
                  color: "#888", borderRadius: 20, padding: "6px 10px",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                  cursor: "pointer", outline: "none",
                }}>
                  <option value="date">Recent first</option>
                  <option value="distance" disabled={!userPos}>Distance {!userPos ? "(no loc)" : ""}</option>
                  <option value="name">A–Z</option>
                </select>
              )}

              {/* Neighborhood chips collapsed into horizontal scroll */}
              <div style={{ display: "flex", gap: 5, overflowX: "auto", flex: 1, minWidth: 0 }}>
                {neighborhoods.slice(0, 5).map(n => n !== "All" && (
                  <button key={n} onClick={() => setFilter(n === activeFilter ? "All" : n)} style={{
                    background: activeFilter === n ? "#f5f0e8" : "transparent",
                    color: activeFilter === n ? "#0a0a0a" : "#555",
                    border: "1px solid " + (activeFilter === n ? "#f5f0e8" : "#222"),
                    borderRadius: 20, padding: "4px 10px", whiteSpace: "nowrap",
                    fontFamily: "'DM Sans', sans-serif", fontSize: 11, cursor: "pointer",
                  }}>{n}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: "0 18px" }}>
            {savedSpots.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#333", fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🗺️</div>
                <p>No spots yet. Go explore NYC!</p>
              </div>
            )}
            {savedSpots.length > 0 && filteredSpots.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#333", fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                <p style={{ fontSize: 13 }}>No matches. {nearMe ? "Nothing saved within 1km." : "Try a different search."}</p>
              </div>
            )}
            {filteredSpots.map((spot, i) => {
              const isVisited = spot.status === "visited";
              const openNow = spot.openNow;
              return (
                <div key={spot.id} className="spot-row"
                  style={{
                    background: "#111", border: "1px solid #1c1c1c",
                    borderRadius: 16, padding: "15px 16px", marginBottom: 9,
                    display: "flex", alignItems: "center", gap: 13,
                    animationDelay: `${i * 0.04}s`,
                    opacity: isVisited ? 0.7 : 1,
                    position: "relative",
                  }}>
                  <span onClick={() => { setSelectedSpot(spot); setScreen("detail"); }}
                    style={{ fontSize: 26, flexShrink: 0, cursor: "pointer" }}>{spot.emoji}</span>
                  <div onClick={() => { setSelectedSpot(spot); setScreen("detail"); }}
                    style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
                    <div style={{ fontSize: 16, marginBottom: 2, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{spot.name}</span>
                      {isVisited && <span style={{ fontSize: 11, color: "#4a9a4a" }}>✓</span>}
                      {openNow === true && <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "#4a9a4a", flexShrink: 0,
                      }} title="Open now" />}
                      {openNow === false && <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "#9a4a4a", flexShrink: 0,
                      }} title="Closed" />}
                    </div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#444", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {spot.vibe && <span style={{ color: "#666" }}>{spot.vibe}</span>}
                      <span>{spot.neighborhood}</span>
                      {spot._dist != null && <span style={{ color: "#e8c547" }}>• {formatDistance(spot._dist)}</span>}
                      {(spot.tags || []).slice(0, 2).map(t => (
                        <span key={t} style={{
                          background: "#1e1e1e", padding: "1px 6px", borderRadius: 10,
                          color: "#666", fontSize: 10,
                        }}>#{t}</span>
                      ))}
                    </div>
                  </div>

                  {/* NEW: ⋯ menu button */}
                  <button onClick={(e) => {
                    e.stopPropagation();
                    haptic(5);
                    setActionMenu(actionMenu === spot.id ? null : spot.id);
                  }} style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: actionMenu === spot.id ? "#222" : "transparent",
                    border: "none", color: "#666", cursor: "pointer",
                    fontSize: 18, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>⋯</button>

                  {/* Action menu popover */}
                  {actionMenu === spot.id && (
                    <>
                      <div onClick={() => setActionMenu(null)} style={{
                        position: "fixed", inset: 0, zIndex: 50,
                      }} />
                      <div style={{
                        position: "absolute", top: "100%", right: 8, marginTop: 4,
                        background: "#1a1a1a", border: "1px solid #2a2a2a",
                        borderRadius: 12, padding: 6, zIndex: 51,
                        minWidth: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
                        animation: "fadeIn 0.15s ease",
                      }}>
                        <button onClick={(e) => { e.stopPropagation(); toggleVisited(spot.id); setActionMenu(null); }} style={menuBtn}>
                          {isVisited ? "🎯 Move to Wishlist" : "✓ Mark as Visited"}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setTagEditor(spot); setActionMenu(null); }} style={menuBtn}>
                          🏷️ Edit tags
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); shareSpot(spot); }} style={menuBtn}>
                          📤 Share
                        </button>
                        <div style={{ height: 1, background: "#2a2a2a", margin: "4px 0" }} />
                        <button onClick={(e) => { e.stopPropagation(); deleteSpot(spot.id); }} style={{ ...menuBtn, color: "#c06060" }}>
                          🗑️ Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* NEW #6: Tag editor modal */}
          {tagEditor && (
            <TagEditor
              spot={tagEditor}
              onSave={(tags) => { updateTags(tagEditor.id, tags); setTagEditor(null); }}
              onClose={() => setTagEditor(null)}
            />
          )}
        </div>
      )}

      {/* ── MAP ── */}
      {/* FIX: use explicit height calculation so the map div gets real pixels */}
      {screen === "map" && (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "52px 28px 16px", flexShrink: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", marginBottom: 4 }}>Explore</div>
            <h1 style={{ fontSize: 32, fontStyle: "italic" }}>Your Map.</h1>
          </div>
          <div style={{
            flex: 1,
            padding: "0 18px 90px",
            display: "flex",
            flexDirection: "column",
            minHeight: 0, // FIX: critical — allows flex child to shrink below content size
          }}>
            <MapView spots={savedSpots} onSpotClick={handleMapSpotClick} />
          </div>
          <NavBar screen={screen} setScreen={setScreen} />
        </div>
      )}

      {/* ── DETAIL ── */}
      {screen === "detail" && liveSelectedSpot && (
        <div style={{ minHeight: "100vh", paddingBottom: 80, animation: "slideUp 0.3s ease" }}>
          <div style={{ padding: "52px 28px 20px" }}>
            <button className="nav-btn" onClick={() => setScreen("saved")} style={{
              background: "none", border: "1px solid #222",
              color: "#666", borderRadius: 12, padding: "8px 14px",
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer",
            }}>← Back</button>
          </div>
          <div style={{ padding: "0 28px 40px" }}>
            {liveSelectedSpot.photoUrl && (
              <div style={{
                width: "100%", height: 180,
                borderRadius: 18, overflow: "hidden",
                marginBottom: 18, background: "#141414",
              }}>
                <img src={liveSelectedSpot.photoUrl} alt={liveSelectedSpot.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              </div>
            )}
            <div style={{ fontSize: 58, marginBottom: 16 }}>{liveSelectedSpot.emoji}</div>
            <h1 style={{ fontSize: 28, lineHeight: 1.2, marginBottom: 5 }}>{liveSelectedSpot.name}</h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#555", marginBottom: 3, textTransform: "capitalize" }}>{liveSelectedSpot.type}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#444", marginBottom: 22 }}>{liveSelectedSpot.address}</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {/* NEW: visited/wishlist toggle */}
              <button onClick={() => toggleVisited(liveSelectedSpot.id)} style={{
                background: liveSelectedSpot.status === "visited" ? "#1a2a1a" : "#1a1a1a",
                border: "1px solid " + (liveSelectedSpot.status === "visited" ? "#2a4a2a" : "#252525"),
                padding: "8px 14px", borderRadius: 20,
                fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                color: liveSelectedSpot.status === "visited" ? "#6ab96a" : "#888",
                cursor: "pointer",
              }}>
                {liveSelectedSpot.status === "visited" ? "✓ Visited" : "🎯 Wishlist"}
              </button>
              {liveSelectedSpot.openNow === true && (
                <span style={{ background: "#1a2a1a", border: "1px solid #2a4a2a", padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#6ab96a" }}>
                  🟢 Open now
                </span>
              )}
              {liveSelectedSpot.openNow === false && (
                <span style={{ background: "#2a1a1a", border: "1px solid #4a2a2a", padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#b96a6a" }}>
                  🔴 Closed
                </span>
              )}
              {liveSelectedSpot.vibe && (
                <span style={{ background: "#1a1a1a", border: "1px solid #252525", padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#888" }}>{liveSelectedSpot.vibe}</span>
              )}
              <span style={{ background: "#1a1a1a", border: "1px solid #252525", padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#444" }}>📅 {formatDate(liveSelectedSpot.savedAt)}</span>
              <span style={{ background: "#1a1a1a", border: "1px solid #252525", padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#444" }}>📍 {liveSelectedSpot.neighborhood}</span>
            </div>

            {/* NEW: tags display */}
            {(liveSelectedSpot.tags || []).length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 22 }}>
                {liveSelectedSpot.tags.map(t => (
                  <span key={t} style={{
                    background: "#1e1a0e", border: "1px solid #3a2a0a",
                    color: "#c8a547", padding: "4px 10px", borderRadius: 14,
                    fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                  }}>#{t}</span>
                ))}
              </div>
            )}

            {liveSelectedSpot.note ? (
              <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 16, padding: 18, marginBottom: 22 }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#444", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 8 }}>Your note</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#888", lineHeight: 1.7 }}>{liveSelectedSpot.note}</p>
              </div>
            ) : null}
            {liveSelectedSpot.lat && (
              <a href={
                // FIX: send to the restaurant's Maps page, not just a coordinate pin.
                // Uses name + address as query and place_id as target when available.
                liveSelectedSpot.id && typeof liveSelectedSpot.id === "string" && liveSelectedSpot.id.startsWith("Ch")
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(liveSelectedSpot.name + " " + (liveSelectedSpot.address || ""))}&query_place_id=${liveSelectedSpot.id}`
                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(liveSelectedSpot.name + " " + (liveSelectedSpot.address || ""))}`
              } target="_blank" rel="noreferrer"
                style={{
                  display: "block", width: "100%", padding: 14, borderRadius: 14, marginBottom: 12,
                  background: "#1a1a1a", border: "1px solid #2a2a2a", textAlign: "center",
                  color: "#f5f0e8", fontFamily: "'DM Sans', sans-serif", fontSize: 14, textDecoration: "none",
                }}>🗺️ Open in Google Maps</a>
            )}
            <button onClick={() => deleteSpot(liveSelectedSpot.id)} style={{
              width: "100%", padding: 14, borderRadius: 14,
              background: "none", border: "1px solid #2a1414",
              color: "#5a2a2a", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer",
            }}>Remove spot</button>
          </div>
        </div>
      )}

      {/* ── INSTALL ── */}
      {screen === "install" && (
        <div style={{ minHeight: "100vh", paddingBottom: 100 }}>
          <div style={{ padding: "52px 28px 24px" }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", marginBottom: 4 }}>Get the app</div>
            <h1 style={{ fontSize: 32, fontStyle: "italic" }}>On your<br />iPhone.</h1>
          </div>
          <div style={{ padding: "0 28px" }}>
            <div style={{
              background: USING_REAL_API ? "#0f1a0f" : "#1a150a",
              border: "1px solid " + (USING_REAL_API ? "#1a3a1a" : "#3a2a0a"),
              borderRadius: 16, padding: 16, marginBottom: 28,
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20 }}>{USING_REAL_API ? "✅" : "⚠️"}</span>
                <div>
                  <div style={{ fontWeight: 600, color: USING_REAL_API ? "#4a9a4a" : "#c8922a", marginBottom: 2 }}>
                    {USING_REAL_API ? "Google API key active" : "Demo mode — no API key yet"}
                  </div>
                  <div style={{ color: "#555", fontSize: 12 }}>
                    {USING_REAL_API ? "Real GPS detection is enabled 🎉" : "Add VITE_GOOGL_MAP to Vercel env vars"}
                  </div>
                </div>
              </div>
            </div>
            {[
              { n: "1", title: "Open in Safari", body: "On your iPhone, go to your Vercel URL in Safari (not Chrome — Safari only for home screen install)." },
              { n: "2", title: "Tap the Share button", body: "Hit the share icon at the bottom of Safari — it looks like a box with an arrow pointing up." },
              { n: "3", title: '"Add to Home Screen"', body: 'Scroll the share sheet and tap "Add to Home Screen". Name it SpotDrop and tap Add.' },
              { n: "4", title: "Done! 🎉", body: "SpotDrop lives on your home screen. Opens full-screen, no browser bar — just like a real app." },
            ].map((step, i) => (
              <div key={step.n} className="install-step" style={{ display: "flex", gap: 16, marginBottom: 24, animationDelay: `${i * 0.07}s` }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: "#e8c547", color: "#0a0a0a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, marginTop: 2,
                }}>{step.n}</div>
                <div>
                  <div style={{ fontSize: 18, marginBottom: 5 }}>{step.title}</div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#555", lineHeight: 1.7 }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NavBar rendered for all screens except map (map renders its own) */}
      {screen !== "map" && <NavBar screen={screen} setScreen={setScreen} />}
    </div>
  );
}
