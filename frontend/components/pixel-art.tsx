import Link from "next/link";

const starPath = "M7 1h2v4h4v2h2v2h-4v2h2v4H9v-2H7v2H3v-4h2V9H1V7h2V5h4Z";

export function PixelIcon({ kind = "star" }: { kind?: "star" | "party" | "route" | "clock" }) {
  const paths = {
    star: starPath,
    party: "M3 1h4v4H3Zm6 2h4v4H9ZM1 7h8v6H7v2H5v-2H3v2H1Zm9 2h5v6h-2v-2h-3Z",
    route: "M1 1h5v5H1Zm9 9h5v5h-5ZM5 3h7v2H5Zm5 1h2v8h-2ZM4 8h4v2H4Zm-2 3h4v2H2Z",
    clock: "M4 1h8v2H4ZM2 3h2v2H2Zm10 0h2v2h-2ZM0 5h2v6H0Zm14 0h2v6h-2ZM2 11h2v2H2Zm10 0h2v2h-2ZM4 13h8v2H4Zm3-9h2v4h3v2H7Z",
  };
  return <svg className="pixel-icon" viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d={paths[kind]} fill="currentColor" /></svg>;
}

export function Brand() {
  return <Link href="/" className="brand"><span className="brand-symbol"><PixelIcon /></span>rendezvous<span className="brand-dot">.</span></Link>;
}

// Original, code-native artwork. The terrain is illustrative, never route data.
export function Overworld() {
  const trees = [[48, 56], [59, 48], [71, 58], [121, 38], [134, 33], [148, 44], [168, 49], [173, 65], [175, 127], [187, 120], [200, 135], [189, 146], [55, 163], [42, 172], [63, 180], [75, 155]];
  const stops = [[73, 80], [145, 63], [165, 160]];
  return <svg viewBox="0 0 240 224" className="overworld" role="img" aria-label="Illustrative pixel-art islands: three friends follow cream paths to one golden meeting star" shapeRendering="crispEdges">
    <defs>
      <pattern id="sea" width="36" height="28" patternUnits="userSpaceOnUse"><rect width="36" height="28" fill="#5d88ab" /><path d="M2 10h2V8h4v2h2m13 10h2v-2h4v2h2" stroke="#95b5c4" strokeWidth="1" fill="none" /></pattern>
      <pattern id="grass" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#6d944d" /><path d="M1 2h2v2H1zm5 4h2v2H6z" fill="#779d54" /></pattern>
      <g id="pine"><path d="M6 0h4v4h3v6h3v6h-6v5H6v-5H0v-6h3V4h3Z" fill="#213626" /><path d="M6 4h4v4h3v6H3V8h3Z" fill="#4e753b" /><path d="M6 4h2v7H5v3H3V8h3Z" fill="#6a934c" /><path d="M7 16h2v5H7Z" fill="#906942" /></g>
      <g id="stop"><path d="M2 0h8v2h2v6h-2v2H2V8H0V2h2Z" fill="#263829" /><path d="M2 2h8v6H2Z" fill="#efd574" /><path d="M3 3h6v4H3Z" fill="#bb8f3c" /></g>
      <g id="friend"><path d="M4 0h8v2h2v8h-2v2h2v6h-2v4H8v-4H6v4H2v-4H0v-6h2v-2H0V2h4Z" fill="#22332c" /><path d="M4 3h7v6H4Z" fill="#e8c59c" /><path d="M2 12h10v5H2Z" fill="currentColor" /><path d="M5 5h2v2H5Zm5 0h2v2h-2Z" fill="#22332c" /></g>
      <g id="cafe"><path d="M0 8h28v18H0Z" fill="#263829" /><path d="M2 10h24v14H2Z" fill="#e8dec1" /><path d="M-2 6h32v5H-2Z" fill="#263829" /><path d="M0 2h28v6H0Z" fill="#c76243" /><path d="M3 2h4v6H3Zm8 0h4v6h-4Zm8 0h4v6h-4Z" fill="#f4e3b0" /><path d="M5 14h5v6H5Zm13 0h5v6h-5Z" fill="#5d88ab" /><path d="M12 16h4v10h-4Z" fill="#906942" /></g>
    </defs>
    <rect width="240" height="224" fill="url(#sea)" />
    <path d="M0 0h240v16h-25v8h-32V13h-34V7h-37v16H72v12H43v19H15v24H0Zm0 204h22v-19h13v-13h24v12h20v18h19v22H0Zm240-84h-17v25h-9v25h13v23h13Z" fill="#486d8d" />
    <g stroke="#263829" strokeWidth="2">
      <path d="M39 62h12V48h30v6h12v19h-5v22H68v13H42v-9H30V77h9Z" fill="#98724a" transform="translate(0 5)" />
      <path d="M39 62h12V48h30v6h12v19h-5v22H68v13H42v-9H30V77h9Z" fill="url(#grass)" />
      <path d="M109 42h13V28h30v8h24v18h13v22h-9v21h-13v14h-30v-8h-23V85h-13V59h8Z" fill="#98724a" transform="translate(0 5)" />
      <path d="M109 42h13V28h30v8h24v18h13v22h-9v21h-13v14h-30v-8h-23V85h-13V59h8Z" fill="url(#grass)" />
      <path d="M96 121h22v-10h25v8h34v-7h24v16h11v21h-6v24h-17v15h-22v14h-41v-9H97v-11H79v-20H68v-23h13v-11h15Z" fill="#98724a" transform="translate(0 5)" />
      <path d="M96 121h22v-10h25v8h34v-7h24v16h11v21h-6v24h-17v15h-22v14h-41v-9H97v-11H79v-20H68v-23h13v-11h15Z" fill="url(#grass)" />
      <path d="M35 153h17v-7h20v17h15v27H73v11H50v-8H33v-18h-7v-12h9Z" fill="#98724a" transform="translate(0 5)" />
      <path d="M35 153h17v-7h20v17h15v27H73v11H50v-8H33v-18h-7v-12h9Z" fill="url(#grass)" />
    </g>
    <g fill="none" stroke="#dae7c0" strokeWidth="1"><path d="M32 106h7v6h25v-4h8m45-1h18v8h31m-73 74v7h31v10h43v-4m-136-7h15v5h24" /></g>
    <path d="M78 84h-20v12h26v21h24v22h21m21-73v22h-19v51m38 26h-17v-18h-23m-78 34h38v-19h19v-15h21" fill="none" stroke="#eee5b5" strokeWidth="4" />
    <path d="M84 108v15m3-15v15m4-15v15" stroke="#856744" strokeWidth="2" />
    {trees.map(([x, y], i) => <use key={i} href="#pine" x={x} y={y} />)}
    {stops.map(([x, y], i) => <use key={i} href="#stop" x={x} y={y} />)}
    <use href="#cafe" x="117" y="154" />
    <use href="#friend" x="61" y="77" style={{ color: "#ce6847" }} />
    <use href="#friend" x="137" y="60" style={{ color: "#eed577" }} />
    <use href="#friend" x="164" y="154" style={{ color: "#9fb7cb" }} />
    <g transform="translate(118 123) scale(1.8)"><path d={starPath} fill="#f8d965" stroke="#263829" strokeWidth="1.3" /><path d="M6 7h1v2H6Zm3 0h1v2H9Z" fill="#263829" /></g>
    <g fill="#e2e5d4"><path d="M14 35h6v2h6v2h-6v-2h-6Zm193 22h6v2h6v2h-6v-2h-6ZM7 124h6v2h6v2h-6v-2H7Zm177 159h6v2h6v2h-6v-2h-6Z" /><path d="M212 91h5v2h5v2h-5v-2h-5ZM102 210h5v2h5v2h-5v-2h-5Z" /></g>
    <g fill="#a6b3b4" stroke="#263829" strokeWidth="1"><path d="M103 73h5v5h-7v-2h2Zm-7 22h5v5h-7v-2h2Zm123 109h5v5h-7v-2h2Zm-6 79h5v5h-7v-2h2Z" /></g>
  </svg>;
}
