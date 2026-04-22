import { useState, useCallback, useRef, useEffect } from "react";

// ─── PASTE YOUR GOOGLE API KEY HERE ───────────────────────────────────────────
const GOOGLE_API_KEY = "AIzaSyCH724hGDPj7qG7vXHfZ3wa27hfZ8Vfhv0";
// ──────────────────────────────────────────────────────────────────────────────

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

function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(); return; }
    const existing = document.getElementById("gmap-script");
    if (existing) { existing.addEventListener("load", resolve); return; }
    const s = document.createElement("script");
    s.id = "gmap-script";
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const USING_REAL_API = GOOGLE_API_KEY !== "YOUR_API_KEY_HERE";

// ─── MAP COMPONENT ────────────────────────────────────────────────────────────
function MapView({ spots, onSpotClick }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!USING_REAL_API) { setMapError(true); return; }
    loadGoogleMaps(GOOGLE_API_KEY)
      .then(() => setMapReady(true))
      .catch(() => setMapError(true));
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInstanceRef.current) return;
    const center = spots.length
      ? { lat: spots[0].lat || 40.7268, lng: spots[0].lng || -73.9815 }
      : { lat: 40.7268, lng: -73.9815 };

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center, zoom: 13,
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
  }, [mapReady, spots]);

  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;
    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];
    spots.forEach(spot => {
      if (!spot.lat || !spot.lng) return;
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
    if (spots.length && mapInstanceRef.current) {
      const bounds = new window.google.maps.LatLngBounds();
      spots.forEach(s => s.lat && bounds.extend({ lat: s.lat, lng: s.lng }));
      mapInstanceRef.current.fitBounds(bounds);
    }
  }, [mapReady, spots, onSpotClick]);

  if (mapError || !USING_REAL_API) {
    // Fallback: stylized static map mockup
    return (
      <div style={{
        flex: 1, background: "#111", borderRadius: 20,
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        border: "1px solid #2a2a2a", gap: 12, padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 36 }}>🗺️</div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#555", lineHeight: 1.6 }}>
          Map needs your Google API key.<br />
          <span style={{ color: "#888" }}>Add it at the top of the file to see your spots on a live map.</span>
        </p>
        {/* Fake map grid for visual */}
        <div style={{ width: "100%", marginTop: 8, position: "relative", height: 180, overflow: "hidden", borderRadius: 12, opacity: 0.4 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ position: "absolute", top: i * 32, left: 0, right: 0, height: 1, background: "#2a2a2a" }} />
          ))}
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ position: "absolute", left: i * 52, top: 0, bottom: 0, width: 1, background: "#2a2a2a" }} />
          ))}
          {spots.slice(0, 5).map((s, i) => (
            <div key={s.id} style={{
              position: "absolute",
              top: 20 + (i * 28) % 140, left: 20 + (i * 47) % 240,
              width: 20, height: 20, borderRadius: "50%",
              background: "#e8c547", fontSize: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>{s.emoji}</div>
          ))}
        </div>
      </div>
    );
  }

  return <div ref={mapRef} style={{ flex: 1, borderRadius: 20, overflow: "hidden", minHeight: 300 }} />;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function SpotDrop() {
  const [screen, setScreen] = useState("home"); // home | saved | map | detail | install
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState(null);
  const [savedSpots, setSavedSpots] = useState([
    { ...MOCK_SPOTS[1], savedAt: Date.now() - 86400000 * 2, vibe: "💡 Hidden gem", note: "Looked incredible at night" },
    { ...MOCK_SPOTS[2], savedAt: Date.now() - 86400000 * 5, vibe: "🎶 Lively", note: "" },
  ]);
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [saveAnim, setSaveAnim] = useState(false);
  const [selectedVibe, setSelectedVibe] = useState(null);
  const [note, setNote] = useState("");
  const [justSaved, setJustSaved] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [filter, setFilter] = useState("All");
  const [gpsStatus, setGpsStatus] = useState("idle"); // idle | locating | searching | done | error

  const detectTimerRef = useRef(null);
  const lastDetectedIdRef = useRef(null);

  // ── Real GPS + Places detection ──────────────────────────────────────────
  const detectReal = useCallback(async () => {
    setGpsStatus("locating");
    setDetected(null);
    setSaveAnim(false);
    setAlreadySaved(false);

    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 10000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      setGpsStatus("searching");

      await loadGoogleMaps(GOOGLE_API_KEY);
      const service = new window.google.maps.places.PlacesService(document.createElement("div"));

      service.nearbySearch({
        location: { lat, lng },
        rankBy: window.google.maps.places.RankBy.DISTANCE,
        type: ["restaurant", "bar", "cafe", "bakery", "night_club"],
      }, (results, status) => {
        if (status === "OK" && results?.length) {
          const place = results[0];
          const spot = {
            id: place.place_id,
            name: place.name,
            type: (place.types || []).slice(0, 2).map(t => t.replace(/_/g, " ")).join(" • "),
            address: place.vicinity,
            distance: "nearby",
            emoji: getEmoji(place.types),
            neighborhood: place.vicinity?.split(",").pop()?.trim() || "NYC",
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          };
          setDetected(spot);
          setGpsStatus("done");
          setSelectedVibe(null);
          setNote("");
        } else {
          setGpsStatus("error");
        }
      });
    } catch (e) {
      setGpsStatus("error");
    }
  }, []);

  // ── Mock detection ───────────────────────────────────────────────────────
  const detectMock = useCallback(() => {
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
      setTimeout(() => setAlreadySaved(false), 2000);
      return;
    }
    setSaveAnim(true);
    const savedVibe = selectedVibe;
    const savedNote = note;
    setTimeout(() => {
      setSavedSpots(prev => [{ ...detected, savedAt: Date.now(), vibe: savedVibe, note: savedNote }, ...prev]);
      setDetected(null);
      setSaveAnim(false);
      setGpsStatus("idle");
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }, 600);
  }, [detected, savedSpots, selectedVibe, note]);

  const skipSpot = useCallback(() => {
    setSaveAnim(false);
    setDetected(null);
    setAlreadySaved(false);
    setGpsStatus("idle");
  }, []);

  const deleteSpot = (id) => {
    setSavedSpots(prev => prev.filter(s => s.id !== id));
    setSelectedSpot(null);
    setScreen("saved");
  };

  const existingNeighborhoods = Array.from(new Set(savedSpots.map(s => s.neighborhood)));
  const neighborhoods = ["All", ...existingNeighborhoods];
  const activeFilter = existingNeighborhoods.includes(filter) ? filter : "All";
  const filteredSpots = activeFilter === "All" ? savedSpots : savedSpots.filter(s => s.neighborhood === activeFilter);

  const isDetecting = gpsStatus === "locating" || gpsStatus === "searching";

  // ── Shared bottom nav ────────────────────────────────────────────────────
  const NavBar = () => (
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
  );

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
        .spinner { width: 18px; height: 18px; border: 2px solid #333; border-top-color: #e8c547; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }
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
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#555", textAlign: "right", marginTop: 4 }}>
              <div style={{ fontSize: 22, marginBottom: 2 }}>📍</div>
              <div>{savedSpots.length} saved</div>
            </div>
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 28px 20px" }}>

            {/* Idle */}
            {!isDetecting && !detected && (
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

            {/* Detecting */}
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
                <p style={{ fontFamily: "'DM Sans', sans-serif", color: "#555", fontSize: 13, letterSpacing: 0.5 }}>
                  {gpsStatus === "locating" ? "Getting your location..." : "Finding what's nearby..."}
                </p>
              </div>
            )}

            {/* GPS Error */}
            {gpsStatus === "error" && (
              <div style={{ textAlign: "center", animation: "fadeIn 0.3s ease", padding: "0 20px" }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: "#666", lineHeight: 1.7, marginBottom: 20 }}>
                  Couldn't detect nearby spots.<br />Check your location permissions.
                </p>
                <button className="nav-btn" onClick={() => setGpsStatus("idle")} style={{
                  background: "#1a1a1a", border: "1px solid #2a2a2a",
                  color: "#f5f0e8", borderRadius: 14, padding: "12px 24px",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                }}>Try again</button>
              </div>
            )}

            {/* Detected card */}
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
          <NavBar />
        </div>
      )}

      {/* ── SAVED LIST ── */}
      {screen === "saved" && (
        <div style={{ minHeight: "100vh", paddingBottom: 80 }}>
          <div style={{ padding: "52px 28px 14px" }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", marginBottom: 4 }}>Your spots</div>
            <h1 style={{ fontSize: 32, fontStyle: "italic" }}>The List.</h1>
          </div>

          {savedSpots.length > 0 && (
            <div style={{ padding: "0 28px 14px", display: "flex", gap: 7, overflowX: "auto" }}>
              {neighborhoods.map(n => (
                <button key={n} className="filter-chip" onClick={() => setFilter(n)} style={{
                  background: activeFilter === n ? "#f5f0e8" : "#141414",
                  color: activeFilter === n ? "#0a0a0a" : "#555",
                  border: "1px solid " + (activeFilter === n ? "#f5f0e8" : "#222"),
                  borderRadius: 20, padding: "6px 14px", whiteSpace: "nowrap",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                }}>{n}</button>
              ))}
            </div>
          )}

          <div style={{ padding: "0 18px" }}>
            {filteredSpots.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#333", fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🗺️</div>
                <p>No spots yet. Go explore NYC!</p>
              </div>
            )}
            {filteredSpots.map((spot, i) => (
              <div key={spot.id} className="spot-row"
                onClick={() => { setSelectedSpot(spot); setScreen("detail"); }}
                style={{
                  background: "#111", border: "1px solid #1c1c1c",
                  borderRadius: 16, padding: "15px 16px", marginBottom: 9,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 13,
                  animationDelay: `${i * 0.04}s`,
                }}>
                <span style={{ fontSize: 26, flexShrink: 0 }}>{spot.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{spot.name}</div>
                  <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#444" }}>
                    {spot.vibe && <span style={{ color: "#666", marginRight: 8 }}>{spot.vibe}</span>}
                    {spot.neighborhood}
                  </div>
                </div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#333", flexShrink: 0 }}>{formatDate(spot.savedAt)}</div>
              </div>
            ))}
          </div>
          <NavBar />
        </div>
      )}

      {/* ── MAP ── */}
      {screen === "map" && (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", paddingBottom: 80 }}>
          <div style={{ padding: "52px 28px 16px" }}>
            <div style={{ fontSize: 10, letterSpacing: 3, color: "#555", fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", marginBottom: 4 }}>Explore</div>
            <h1 style={{ fontSize: 32, fontStyle: "italic" }}>Your Map.</h1>
          </div>
          <div style={{ flex: 1, padding: "0 18px", display: "flex", flexDirection: "column" }}>
            <MapView
              spots={savedSpots}
              onSpotClick={(spot) => { setSelectedSpot(spot); setScreen("detail"); }}
            />
          </div>
          <NavBar />
        </div>
      )}

      {/* ── DETAIL ── */}
      {screen === "detail" && selectedSpot && (
        <div style={{ minHeight: "100vh", paddingBottom: 80, animation: "slideUp 0.3s ease" }}>
          <div style={{ padding: "52px 28px 20px" }}>
            <button className="nav-btn" onClick={() => setScreen("saved")} style={{
              background: "none", border: "1px solid #222",
              color: "#666", borderRadius: 12, padding: "8px 14px",
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, cursor: "pointer",
            }}>← Back</button>
          </div>
          <div style={{ padding: "0 28px 40px" }}>
            <div style={{ fontSize: 58, marginBottom: 16 }}>{selectedSpot.emoji}</div>
            <h1 style={{ fontSize: 28, lineHeight: 1.2, marginBottom: 5 }}>{selectedSpot.name}</h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#555", marginBottom: 3, textTransform: "capitalize" }}>{selectedSpot.type}</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#444", marginBottom: 22 }}>{selectedSpot.address}</p>

            <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
              {selectedSpot.vibe && (
                <span style={{ background: "#1a1a1a", border: "1px solid #252525", padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#888" }}>{selectedSpot.vibe}</span>
              )}
              <span style={{ background: "#1a1a1a", border: "1px solid #252525", padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#444" }}>📅 {formatDate(selectedSpot.savedAt)}</span>
              <span style={{ background: "#1a1a1a", border: "1px solid #252525", padding: "8px 14px", borderRadius: 20, fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#444" }}>📍 {selectedSpot.neighborhood}</span>
            </div>

            {selectedSpot.note ? (
              <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 16, padding: 18, marginBottom: 22 }}>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 10, color: "#444", letterSpacing: 2.5, textTransform: "uppercase", marginBottom: 8 }}>Your note</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "#888", lineHeight: 1.7 }}>{selectedSpot.note}</p>
              </div>
            ) : null}

            {USING_REAL_API && selectedSpot.lat && (
              <a href={`https://maps.google.com/?q=${selectedSpot.lat},${selectedSpot.lng}`} target="_blank" rel="noreferrer"
                style={{
                  display: "block", width: "100%", padding: 14, borderRadius: 14, marginBottom: 12,
                  background: "#1a1a1a", border: "1px solid #2a2a2a", textAlign: "center",
                  color: "#f5f0e8", fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                  textDecoration: "none",
                }}>🗺️ Open in Google Maps</a>
            )}

            <button onClick={() => deleteSpot(selectedSpot.id)} style={{
              width: "100%", padding: 14, borderRadius: 14,
              background: "none", border: "1px solid #2a1414",
              color: "#5a2a2a", fontFamily: "'DM Sans', sans-serif", fontSize: 14, cursor: "pointer",
            }}>Remove spot</button>
          </div>
          <NavBar />
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
            {/* API key status */}
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
                    {USING_REAL_API ? "Real GPS detection is enabled 🎉" : "Paste your key at the top of spot-drop.jsx"}
                  </div>
                </div>
              </div>
            </div>

            {/* Steps */}
            {[
              {
                n: "1", title: "Host the app",
                body: "Upload spot-drop.jsx to a free host like Vercel or Netlify. Takes 2 minutes — just drag and drop.",
                link: "https://vercel.com", linkLabel: "Open Vercel →",
              },
              {
                n: "2", title: "Open it in Safari",
                body: "On your iPhone, open Safari and go to your app's URL. It must be Safari — Chrome won't work for adding to home screen.",
              },
              {
                n: "3", title: `Tap the Share button`,
                body: `Hit the share icon (the box with an arrow) at the bottom of Safari.`,
              },
              {
                n: "4", title: `"Add to Home Screen"`,
                body: `Scroll down in the share sheet and tap "Add to Home Screen". Name it SpotDrop and tap Add.`,
              },
              {
                n: "5", title: "Done! 🎉",
                body: "SpotDrop now lives on your home screen. Tap it and it opens full-screen, no browser bar — just like a real app.",
              },
            ].map((step, i) => (
              <div key={step.n} className="install-step" style={{
                display: "flex", gap: 16, marginBottom: 24,
                animationDelay: `${i * 0.07}s`,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: "#e8c547", color: "#0a0a0a",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14,
                  marginTop: 2,
                }}>{step.n}</div>
                <div>
                  <div style={{ fontSize: 18, marginBottom: 5 }}>{step.title}</div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#555", lineHeight: 1.7 }}>{step.body}</p>
                  {step.link && (
                    <a href={step.link} target="_blank" rel="noreferrer" style={{
                      display: "inline-block", marginTop: 8,
                      fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                      color: "#e8c547", textDecoration: "none",
                    }}>{step.linkLabel}</a>
                  )}
                </div>
              </div>
            ))}
          </div>
          <NavBar />
        </div>
      )}
    </div>
  );
}
