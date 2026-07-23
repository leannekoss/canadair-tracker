// Carte MapLibre + deck.gl : trails animés (TripsLayer), positions (IconLayer),
// callsigns (TextLayer), hotspots incendies (ScatterplotLayer).

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { TripsLayer } from "@deck.gl/geo-layers";
import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { positionAt } from "../lib/replay";
import {
  aircraftKind, colorFor, FIRE_COLOR, FRANCE_VIEW, INK, MAP_STYLE, NIMES_GARONS, SATELLITE_STYLE,
} from "../theme";

// Glyphe avion vu de dessus, nez vers le nord (recoloré via mask)
const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><path fill="#fff" d="M32 3 L36.5 20 L60 30.5 L60 36.5 L36.5 31.5 L35 48 L45 56.5 L45 61 L32 56.5 L19 61 L19 56.5 L29 48 L27.5 31.5 L4 36.5 L4 30.5 L27.5 20 Z"/></svg>`;
const PLANE_ICON = {
  url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(PLANE_SVG),
  width: 64,
  height: 64,
  anchorX: 32,
  anchorY: 32,
  mask: true,
};

// Silhouette latérale : cabine, patins, longue poutre de queue et rotor arrière.
// À 34 px cette lecture est bien plus immédiate qu'une vue de dessus abstraite.
const HELICOPTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <g fill="#fff">
    <rect x="3" y="10" width="43" height="3" rx="1.5"/>
    <rect x="23" y="11" width="3" height="9" rx="1.5"/>
    <path d="M7 31c0-8.2 6.8-13 17.5-13 9.2 0 15 4.2 17.2 10.7L57 24v5l-14.3 5.2C41 41.7 34.6 46 24.5 46 13.7 46 7 40.6 7 31Z"/>
    <path d="M19 44h3v7h-3zM34 43h3v8h-3zM14 50h29v3H14z"/>
    <path d="M54 17h3v15h-3zM49 23h13v3H49z"/>
  </g>
</svg>`;
const HELICOPTER_ICON = {
  url: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(HELICOPTER_SVG),
  width: 64,
  height: 64,
  anchorX: 32,
  anchorY: 32,
  mask: true,
};

export default function MapView({
  fleetByHex,
  trails,
  liveMap,
  mode,            // 'live' | 'replay'
  replayTime,      // epoch s (mode replay)
  t0,              // origine de normalisation des timestamps (float32 deck.gl)
  fires,
  showFires,
  hiddenCats,
  satellite,
  mission,
  selectedHex,
  onSelect,
  onMapReady,
  evacPoints = [],
  showEvac,
  onEvacSelect,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const satRef = useRef(false);
  const [mapError, setMapError] = useState(null);

  // --- Init MapLibre (une seule fois) ---
  useEffect(() => {
    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE,
        center: [FRANCE_VIEW.longitude, FRANCE_VIEW.latitude],
        zoom: FRANCE_VIEW.zoom,
        attributionControl: { compact: true },
      });
    } catch (error) {
      console.warn("Carte indisponible :", error);
      setMapError("La carte 3D n’est pas disponible sur ce navigateur.");
      return;
    }
    map.on("error", (event) => {
      if (!map.loaded() && event?.error?.message?.toLowerCase().includes("webgl")) {
        setMapError("La carte 3D n’est pas disponible sur ce navigateur.");
      }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    // Labels en français : le style CARTO affiche l'anglais par défaut ("BRITTANY",
    // "GREATER EAST"). On rebase chaque couche texte sur name:fr, repli nom local.
    map.on("style.load", () => {
      const frName = ["coalesce", ["get", "name:fr"], ["get", "name_fr"], ["get", "name"]];
      for (const layer of map.getStyle().layers) {
        if (layer.type !== "symbol") continue;
        const tf = map.getLayoutProperty(layer.id, "text-field");
        if (tf && JSON.stringify(tf).includes("name")) {
          map.setLayoutProperty(layer.id, "text-field", frName);
        }
      }
    });
    // pickingRadius : tolérance de sélection autour du pointeur — indispensable au doigt
    const overlay = new MapboxOverlay({ interleaved: false, pickingRadius: 16, layers: [] });
    map.addControl(overlay);
    mapRef.current = map;
    overlayRef.current = overlay;
    onMapReady?.(map);
    return () => map?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Bascule plan ↔ satellite (l'overlay deck.gl survit au setStyle) ---
  useEffect(() => {
    const map = mapRef.current;
    if (!map || satRef.current === satellite) return;
    satRef.current = satellite;
    map.setStyle(satellite ? SATELLITE_STYLE : MAP_STYLE);
    // le listener style.load (labels français) ne s'applique qu'au style vectoriel
  }, [satellite]);

  // Données de trails STABLES entre les ticks du replay : en lecture, seul
  // currentTime change 20×/s — si data changeait de référence à chaque frame,
  // deck.gl recalculerait et re-uploaderait tous les attributs GPU en continu.
  const trailList = useMemo(
    () =>
      Object.values(trails).filter((tr) => {
        const meta = fleetByHex[tr.hex];
        return meta && !hiddenCats?.has(meta.category);
      }),
    [trails, fleetByHex, hiddenCats]
  );

  // --- Rebuild des layers deck.gl à chaque changement de données/temps ---
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    if (t0 == null) {
      overlay.setProps({ layers: [] }); // aucune trace : ne pas figer des layers périmés
      return;
    }

    const now = Date.now() / 1000;
    const currentTime = (mode === "replay" ? replayTime : now) - t0;

    const visible = (hex) => {
      const meta = fleetByHex[hex];
      return meta && !hiddenCats?.has(meta.category);
    };

    // Positions affichées : live = flux temps réel · replay = interpolation sur les traces
    let positions;
    if (mode === "replay") {
      positions = trailList
        .map((tr) => {
          const p = positionAt(tr, replayTime);
          return p && { hex: tr.hex, callsign: null, ...p };
        })
        .filter(Boolean);
    } else {
      positions = Object.values(liveMap)
        .filter((ac) => ac.lat != null && visible(ac.hex))
        .map((ac) => ({ ...ac }));
    }

    const dimUnselected = (hex, alpha = 255) =>
      selectedHex && hex !== selectedHex ? 80 : alpha;

    const layers = [
      // Halo braise des feux (dessous) — taille ∝ intensité (FRP), présence ∝ fraîcheur
      showFires &&
        new ScatterplotLayer({
          id: "fires-halo",
          data: fires,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: (d) => 700 + Math.min(d.frp ?? 0, 250) * 7,
          radiusMinPixels: 3,
          radiusMaxPixels: 26,
          getFillColor: (d) => [...FIRE_COLOR, d.ageHours <= 6 ? 26 : 13],
          pickable: false,
        }),
      showFires &&
        new ScatterplotLayer({
          id: "fires-core",
          data: fires,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: (d) => 200 + Math.min(d.frp ?? 0, 250) * 1.6,
          radiusMinPixels: 1.5,
          radiusMaxPixels: 6,
          getFillColor: (d) => [...FIRE_COLOR, d.ageHours <= 6 ? 200 : 90],
          pickable: false,
        }),
      // Base avions de la Sécurité Civile
      new ScatterplotLayer({
        id: "base",
        data: [NIMES_GARONS],
        getPosition: (d) => [d.longitude, d.latitude],
        getRadius: 400,
        radiusMinPixels: 3,
        radiusMaxPixels: 8,
        getFillColor: [148, 161, 181, 140],
        stroked: true,
        getLineColor: [148, 161, 181, 220],
        getLineWidth: 300,
        lineWidthMinPixels: 1,
      }),
      new TextLayer({
        id: "base-label",
        data: [NIMES_GARONS],
        getPosition: (d) => [d.longitude, d.latitude],
        getText: () => "BASC NÎMES-GARONS",
        getSize: 10,
        getColor: [148, 161, 181, 200],
        getPixelOffset: [0, 14],
        fontFamily: "Barlow Condensed, sans-serif",
        fontWeight: 600,
        characterSet: "auto",
      }),
      // Trails animés
      new TripsLayer({
        id: "trips",
        data: trailList,
        getPath: (d) => d.points.map((p) => [p.lon, p.lat]),
        getTimestamps: (d) => d.points.map((p) => p.t - t0),
        getColor: (d) => [...colorFor(fleetByHex[d.hex]), dimUnselected(d.hex)],
        widthMinPixels: 2.5,
        capRounded: true,
        jointRounded: true,
        fadeTrail: true,
        trailLength: mode === "replay" ? 1500 : 7200,
        currentTime,
        updateTriggers: {
          getColor: [selectedHex],
          getTimestamps: [t0],
        },
      }),
      // Points d'écopage estimés de l'appareil sélectionné (anneaux « eau »)
      selectedHex &&
        mission?.scoopClusters?.length > 0 &&
        new ScatterplotLayer({
          id: "scoops",
          data: mission.scoopClusters,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 600,
          radiusMinPixels: 6,
          radiusMaxPixels: 15,
          stroked: true,
          filled: false,
          getLineColor: [120, 190, 235, 230],
          getLineWidth: 180,
          lineWidthMinPixels: 2,
        }),
      // Anneau de sélection
      selectedHex &&
        new ScatterplotLayer({
          id: "selection-ring",
          data: positions.filter((p) => p.hex === selectedHex),
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 900,
          radiusMinPixels: 16,
          radiusMaxPixels: 34,
          stroked: true,
          filled: false,
          getLineColor: [...INK, 180],
          getLineWidth: 150,
          lineWidthMinPixels: 1.5,
        }),
      // Appareils
      new IconLayer({
        id: "aircraft",
        data: positions,
        getPosition: (d) => [d.lon, d.lat],
        getIcon: (d) => aircraftKind(fleetByHex[d.hex]) === "helicopter" ? HELICOPTER_ICON : PLANE_ICON,
        getSize: (d) => {
          const base = aircraftKind(fleetByHex[d.hex]) === "helicopter" ? 34 : 26;
          return d.hex === selectedHex ? base + 8 : base;
        },
        getAngle: (d) => -(d.track ?? 0),
        getColor: (d) => {
          const c = colorFor(fleetByHex[d.hex]);
          return d.onGround ? [...c, 130] : [...c, 255];
        },
        billboard: false,
        pickable: true,
        onClick: (info) => info.object && onSelect?.(info.object.hex),
        updateTriggers: {
          getSize: [selectedHex],
        },
      }),
      // Callsigns
      new TextLayer({
        id: "callsigns",
        data: positions,
        getPosition: (d) => [d.lon, d.lat],
        getText: (d) =>
          d.callsign || fleetByHex[d.hex]?.reg || d.hex.toUpperCase(),
        getSize: 12,
        getColor: [...INK, 235],
        getPixelOffset: (d) => [0, aircraftKind(fleetByHex[d.hex]) === "helicopter" ? 30 : 24],
        fontFamily: "Barlow Condensed, sans-serif",
        fontWeight: 600,
        fontSettings: { sdf: true },
        outlineWidth: 5,
        outlineColor: [11, 16, 23, 255],
        characterSet: "auto",
        pickable: true,
        onClick: (info) => info.object && onSelect?.(info.object.hex),
      }),
      // Couche « évacuation maritime » : points d'embarquement / accueil du plan
      showEvac &&
        evacPoints.length > 0 &&
        new ScatterplotLayer({
          id: "evac",
          data: evacPoints,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 260,
          radiusMinPixels: 7,
          radiusMaxPixels: 13,
          getFillColor: (d) =>
            d.role === "embarquement" ? [214, 52, 38, 255] : [53, 192, 101, 255],
          stroked: true,
          getLineColor: [237, 232, 220, 235],
          getLineWidth: 60,
          lineWidthMinPixels: 2,
          pickable: true,
          onClick: (info) => info.object && onEvacSelect?.(info.object),
        }),
      showEvac &&
        evacPoints.length > 0 &&
        new TextLayer({
          id: "evac-labels",
          data: evacPoints,
          getPosition: (d) => [d.lon, d.lat],
          getText: (d) => d.nom,
          getSize: 11,
          getColor: [...INK, 235],
          getPixelOffset: [0, 18],
          fontFamily: "Barlow Condensed, sans-serif",
          fontWeight: 600,
          fontSettings: { sdf: true },
          outlineWidth: 5,
          outlineColor: [11, 16, 23, 255],
          characterSet: "auto",
          pickable: true,
          onClick: (info) => info.object && onEvacSelect?.(info.object),
        }),
    ].filter(Boolean);

    overlay.setProps({ layers });
  }, [fleetByHex, trailList, liveMap, mode, replayTime, t0, fires, showFires, hiddenCats, mission, selectedHex, onSelect, evacPoints, showEvac, onEvacSelect]);

  // h-full explicite : maplibre-gl.css force position:relative sur ce div (classe
  // maplibregl-map), ce qui neutraliserait un dimensionnement par inset-0
  return (
    <div className="relative h-full w-full bg-surface">
      <div ref={containerRef} className="h-full w-full" />
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_center,#16202f_0,#0b1017_68%)] px-8 text-center">
          <div className="max-w-sm">
            <div className="font-display text-5xl text-ink-faint" aria-hidden="true">⌖</div>
            <p className="mt-3 font-display text-xl font-bold uppercase tracking-wide text-ink">Carte indisponible</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-dim">{mapError} La flotte, les statuts et le replay restent accessibles.</p>
          </div>
        </div>
      )}
    </div>
  );
}
