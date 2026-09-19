# Third Wheel

PWA, ki posluša pogovor za mizo, vskoči samo ko je koristno, pove 1–2 stavka z viri in utihne. Jezik: slovenščina in angleščina, tudi mešano.

Ime izdelka je **Third Wheel**. Ni logina. Ena seja v zavihku.

## Zaženi lokalno

```bash
git clone https://github.com/uraruguy/third-wheel.git
cd third-wheel
cp .env.example .env.local
```

V `.env.local` nastavi:

```
SONIOX_API_KEY=
OPENROUTER_API_KEY=
```

Ključa nikoli ne committaj. `.env.local` je v `.gitignore`.

```bash
npm install
npm run dev
```

Odpri [http://localhost:3500](http://localhost:3500). Dovoli mikrofon.

## Demo za mizo

1. Telefon ali laptop položi na mizo, zvočnik vklopljen, glasnost slišna vsem.
2. Pritisni **Start listening**.
3. Pogovarjajte se. Third Wheel ostane tiho, razen ko:
   - nekdo izreče očitno napačno preverljivo dejstvo,
   - iščete številko/ime in je očitno, da je ne veste,
   - rečete **hey third wheel**, **third wheel** ali **hej third wheel**.
4. Ko vskoči, slišite 1–2 stavka in na zaslonu kartice virov z **Read more**.
5. Naslednjih ~18 s lahko rečete **search for X instead** ali **poišči raje X** — prekine govor in poišče znova.

Echo zaščita: mikrofon z `echoCancellation`, med govorom se vhod zmanjša, lastni govor ne gre v odločitev.

## Ukazi

```bash
npm run lint
npm test
```

Testi: wake phrase, pragovi Jev, okna transkripta, parsiranje `NO_SPEAK`.

## Stack

- Next.js App Router + TypeScript PWA
- Soniox STT `stt-rt-v5` in TTS `tts-rt-v2` (brskalnik, začasni ključi z backend-a)
- Jev `typesafe/jev-1.13` samo na strežniku
- Govor: `google/gemini-3.1-flash-lite` + `openrouter:web_search` (`max_uses: 2`)
