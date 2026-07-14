// Carte MapLibre + deck.gl : trails animés (TripsLayer), positions (IconLayer),
// callsigns (TextLayer), hotspots incendies (ScatterplotLayer).

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { TripsLayer } from "@deck.gl/geo-layers";
import { IconLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import { positionAt } from "../lib/replay";
import {
  colorFor, FIRE_COLOR, FRANCE_VIEW, INK, MAP_STYLE, NIMES_GARONS, SATELLITE_STYLE,
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
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const satRef = useRef(false);

  // --- Init MapLibre (une seule fois) ---
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [FRANCE_VIEW.longitude, FRANCE_VIEW.latitude],
      zoom: FRANCE_VIEW.zoom,
      attributionControl: { compact: true },
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
    return () => map.remove();
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

  // --- Rebuild des layers deck.gl à chaque changement de données/temps ---
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || t0 == null) return;

    const now = Date.now() / 1000;
    const currentTime = (mode === "replay" ? replayTime : now) - t0;

    const visible = (hex) => {
      const meta = fleetByHex[hex];
      return meta && !hiddenCats?.has(meta.category);
    };
    const trailList = Object.values(trails).filter((tr) => visible(tr.hex));

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
        getIcon: () => PLANE_ICON,
        getSize: (d) => (d.hex === selectedHex ? 34 : 26),
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
        getPixelOffset: [0, 24],
        fontFamily: "Barlow Condensed, sans-serif",
        fontWeight: 600,
        fontSettings: { sdf: true },
        outlineWidth: 5,
        outlineColor: [11, 16, 23, 255],
        characterSet: "auto",
        pickable: true,
        onClick: (info) => info.object && onSelect?.(info.object.hex),
      }),
    ].filter(Boolean);

    overlay.setProps({ layers });
  }, [fleetByHex, trails, liveMap, mode, replayTime, t0, fires, showFires, hiddenCats, mission, selectedHex, onSelect]);

  // h-full explicite : maplibre-gl.css force position:relative sur ce div (classe
  // maplibregl-map), ce qui neutraliserait un dimensionnement par inset-0
  return <div ref={containerRef} className="h-full w-full" />;
}
