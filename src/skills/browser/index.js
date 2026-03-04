import * as cheerio from 'cheerio';

export async function fetchWebPage(url) {
    console.log(`\n[System] ❯ Freyana lagi nyedot data dari: ${url} ...\n`);

    try {
        // Menggunakan native fetch Node.js + Fake User-Agent
        const response = await fetch(url.trim(), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            signal: AbortSignal.timeout(15000) // Timeout 15 detik agar tidak hang
        });

        if (!response.ok) {
            return `[BROWSER_ERROR] Gagal akses web. HTTP Status: ${response.status} ${response.statusText}`;
        }

        const html = await response.text();
        
        // Parsing HTML menggunakan Cheerio
        const $ = cheerio.load(html);

        // Buang elemen yang bikin kotor dan berat
        $('script, style, noscript, iframe, img, svg, nav, footer, header, aside').remove();

        // Ambil teks murni dari sisa body
        let extractedText = $('body').text();

        // Rapihkan spasi dan enter yang berlebihan agar hemat token
        extractedText = extractedText.replace(/\s+/g, ' ').trim();

        if (!extractedText) {
            return "[BROWSER_LOG] Halaman berhasil diakses, tapi ga nemu teks yang bisa dibaca (mungkin halamannya full JavaScript).";
        }

        // Potong teks agar tidak bikin OOM di Termux (maksimal 4000 karakter)
        const MAX_WEB_CHARS = 4000;
        if (extractedText.length > MAX_WEB_CHARS) {
            extractedText = extractedText.substring(0, MAX_WEB_CHARS) + "\n...[TEKS DIPOTONG KARENA KEPANJANGAN]...";
        }

        return `[WEB_CONTENT dari ${url}]:\n${extractedText}`;

    } catch (error) {
        if (error.name === 'TimeoutError') {
            return `[BROWSER_ERROR] Koneksi timeout saat mencoba akses ${url}. Website mungkin down atau ngeblokir bot.`;
        }
        return `[BROWSER_ERROR] Gagal akses ${url}: ${error.message}`;
    }
}

