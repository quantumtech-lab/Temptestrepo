// Kinoger Scraper for Sora/Luna
// Converted from Kotlin Cloudstream plugin
// Language: German (de)
// Supports: TV Series and Movies

const mainUrl = "https://kinoger.to";

// Helper function to parse HTML (simple regex-based parser for JavaScriptCore)
function parseHTML(html) {
    return {
        select: function(selector) {
            const elements = [];
            
            // Simple div.short parser
            if (selector === "div#dle-content div.short") {
                const shortRegex = /<div[^>]*class="[^"]*short[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
                let match;
                while ((match = shortRegex.exec(html)) !== null) {
                    elements.push(createElementObject(match[0]));
                }
            }
            
            // div.titlecontrol parser
            if (selector === "div#dle-content div.titlecontrol") {
                const titleControlRegex = /<div[^>]*class="[^"]*titlecontrol[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
                let match;
                while ((match = titleControlRegex.exec(html)) !== null) {
                    elements.push(createElementObject(match[0]));
                }
            }
            
            // ul.ul_related li parser
            if (selector === "ul.ul_related li") {
                const liRegex = /<ul[^>]*class="[^"]*ul_related[^"]*"[^>]*>([\s\S]*?)<\/ul>/i;
                const ulMatch = liRegex.exec(html);
                if (ulMatch) {
                    const liItemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
                    let match;
                    while ((match = liItemRegex.exec(ulMatch[1])) !== null) {
                        elements.push(createElementObject(match[0]));
                    }
                }
            }
            
            // li.category a parser
            if (selector === "li.category a") {
                const categoryRegex = /<li[^>]*class="[^"]*category[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
                let match;
                while ((match = categoryRegex.exec(html)) !== null) {
                    const aRegex = /<a[^>]*>([\s\S]*?)<\/a>/gi;
                    let aMatch;
                    while ((aMatch = aRegex.exec(match[1])) !== null) {
                        elements.push(createElementObject(aMatch[0]));
                    }
                }
            }
            
            // div[id^=container-video] script parser
            if (selector === "div[id^=container-video] script") {
                const containerRegex = /<div[^>]*id="container-video[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
                let match;
                while ((match = containerRegex.exec(html)) !== null) {
                    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
                    let scriptMatch;
                    while ((scriptMatch = scriptRegex.exec(match[1])) !== null) {
                        elements.push(createElementObject(scriptMatch[0]));
                    }
                }
            }
            
            return elements;
        },
        
        selectFirst: function(selector) {
            // h1#news-title parser
            if (selector === "h1#news-title") {
                const h1Regex = /<h1[^>]*id="news-title"[^>]*>([\s\S]*?)<\/h1>/i;
                const match = h1Regex.exec(html);
                if (match) {
                    return createElementObject(match[0]);
                }
            }
            
            // div.images-border img parser
            if (selector === "div.images-border img") {
                const divRegex = /<div[^>]*class="[^"]*images-border[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
                const divMatch = divRegex.exec(html);
                if (divMatch) {
                    const imgRegex = /<img[^>]*>/i;
                    const imgMatch = imgRegex.exec(divMatch[1]);
                    if (imgMatch) {
                        return createElementObject(imgMatch[0]);
                    }
                }
            }
            
            // div.images-border parser
            if (selector === "div.images-border") {
                const divRegex = /<div[^>]*class="[^"]*images-border[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
                const match = divRegex.exec(html);
                if (match) {
                    return createElementObject(match[0]);
                }
            }
            
            return null;
        }
    };
}

// Helper function to create element-like objects
function createElementObject(htmlString) {
    return {
        html: htmlString,
        
        selectFirst: function(selector) {
            // a tag parser
            if (selector === "a") {
                const aRegex = /<a[^>]*>([\s\S]*?)<\/a>/i;
                const match = aRegex.exec(this.html);
                if (match) {
                    return createElementObject(match[0]);
                }
            }
            
            // img tag parser
            if (selector === "img") {
                const imgRegex = /<img[^>]*>/i;
                const match = imgRegex.exec(this.html);
                if (match) {
                    return createElementObject(match[0]);
                }
            }
            
            // div.content_text img parser
            if (selector === "div.content_text img") {
                const divRegex = /<div[^>]*class="[^"]*content_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i;
                const divMatch = divRegex.exec(this.html);
                if (divMatch) {
                    const imgRegex = /<img[^>]*>/i;
                    const imgMatch = imgRegex.exec(divMatch[1]);
                    if (imgMatch) {
                        return createElementObject(imgMatch[0]);
                    }
                }
            }
            
            return null;
        },
        
        select: function(selector) {
            const elements = [];
            
            // script tag parser
            if (selector === "script") {
                const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
                let match;
                while ((match = scriptRegex.exec(this.html)) !== null) {
                    elements.push(createElementObject(match[0]));
                }
            }
            
            return elements;
        },
        
        attr: function(attrName) {
            const attrRegex = new RegExp(attrName + '="([^"]*)"', 'i');
            const match = attrRegex.exec(this.html);
            return match ? match[1] : "";
        },
        
        text: function() {
            // Remove all HTML tags and get text content
            const textContent = this.html.replace(/<[^>]*>/g, '');
            // Decode HTML entities
            return textContent
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .trim();
        },
        
        data: function() {
            // Get script content (between tags)
            const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/i;
            const match = scriptRegex.exec(this.html);
            return match ? match[1] : "";
        },
        
        nextElementSibling: function() {
            // Return a mock object with selectFirst capability
            return {
                selectFirst: function(selector) {
                    return null;
                }
            };
        },
        
        hasAttr: function(attrName) {
            const attrRegex = new RegExp(attrName + '="', 'i');
            return attrRegex.test(this.html);
        },
        
        getImageAttr: function() {
            if (this.hasAttr("data-src")) {
                return this.attr("data-src");
            } else if (this.hasAttr("data-lazy-src")) {
                return this.attr("data-lazy-src");
            } else if (this.hasAttr("srcset")) {
                const srcset = this.attr("srcset");
                return srcset.split(" ")[0];
            } else {
                return this.attr("src");
            }
        }
    };
}

// Helper function to get proper link
function getProperLink(uri) {
    if (uri.includes("-episode-")) {
        const regex = new RegExp(mainUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "/(.+)-ep.+");
        const match = regex.exec(uri);
        if (match && match[1]) {
            return mainUrl + "/series/" + match[1];
        }
    }
    return uri;
}

// Helper function to fix URL
function fixUrlNull(url) {
    if (!url || url === "") return null;
    if (url.startsWith("http")) return url;
    if (url.startsWith("//")) return "https:" + url;
    if (url.startsWith("/")) return mainUrl + url;
    return mainUrl + "/" + url;
}

// Helper function to convert element to search result
function elementToSearchResult(element) {
    try {
        const aElement = element.selectFirst("a");
        if (!aElement) return null;
        
        const href = getProperLink(aElement.attr("href"));
        if (!href) return null;
        
        let title = aElement.text();
        if (!title || title === "") {
            const imgElement = element.selectFirst("img");
            if (imgElement) {
                title = imgElement.attr("alt");
                if (!title || title === "") {
                    title = aElement.attr("title");
                }
            } else {
                title = aElement.attr("title");
            }
        }
        
        if (!title || title === "") return null;
        
        // Remove " Film" suffix if present
        title = title.replace(/ Film$/, '');
        
        let posterPath = null;
        const contentImg = element.selectFirst("div.content_text img");
        if (contentImg) {
            posterPath = contentImg.getImageAttr();
        } else {
            const nextSibling = element.nextElementSibling();
            if (nextSibling) {
                const nextImg = nextSibling.selectFirst("div.content_text img");
                if (nextImg) {
                    posterPath = nextImg.getImageAttr();
                }
            }
            
            if (!posterPath) {
                const imgElement = element.selectFirst("img");
                if (imgElement) {
                    posterPath = imgElement.getImageAttr();
                }
            }
        }
        
        return {
            title: title,
            image: fixUrlNull(posterPath) || "",
            href: href
        };
    } catch (error) {
        return null;
    }
}

// Helper function to transpose 2D array
function transpose(table) {
    if (!table || table.length === 0) return [];
    
    const ret = [];
    const N = table[0].length;
    
    for (let i = 0; i < N; i++) {
        const col = [];
        for (let j = 0; j < table.length; j++) {
            col.push(table[j][i]);
        }
        ret.push(col);
    }
    
    return ret;
}

// Main search function
async function searchResults(keyword) {
    try {
        const encodedKeyword = encodeURIComponent(keyword);
        const url = `${mainUrl}/?do=search&subaction=search&titleonly=3&story=${encodedKeyword}&x=0&y=0&submit=submit`;
        
        const responseText = await fetch(url);
        const document = parseHTML(responseText);
        
        const elements = document.select("div#dle-content div.titlecontrol");
        const results = [];
        
        for (const element of elements) {
            const searchResult = elementToSearchResult(element);
            if (searchResult) {
                results.push(searchResult);
            }
        }
        
        return JSON.stringify(results);
        
    } catch (error) {
        console.log('Search error:', error);
        return JSON.stringify([{ title: 'Error', image: '', href: '' }]);
    }
}

// Extract details function
async function extractDetails(url) {
    try {
        const responseText = await fetch(url);
        const document = parseHTML(responseText);
        
        const titleElement = document.selectFirst("h1#news-title");
        const title = titleElement ? titleElement.text() : "";
        
        const posterElement = document.selectFirst("div.images-border img");
        const poster = posterElement ? fixUrlNull(posterElement.getImageAttr()) : null;
        
        const descElement = document.selectFirst("div.images-border");
        const description = descElement ? descElement.text() : "No description available";
        
        // Extract year from title
        const yearRegex = /\((\d{4})\)/;
        const yearMatch = yearRegex.exec(title);
        const year = yearMatch ? yearMatch[1] : "Unknown";
        
        // Extract tags/categories
        const categoryElements = document.select("li.category a");
        const tags = [];
        for (const catElement of categoryElements) {
            tags.push(catElement.text());
        }
        
        const transformedResult = {
            description: description || 'No description available',
            aliases: `Year: ${year} | Tags: ${tags.join(', ')}`,
            airdate: `Title: ${title}`
        };
        
        return JSON.stringify([transformedResult]);
        
    } catch (error) {
        console.log('Details error:', error);
        return JSON.stringify([{
            description: 'Error loading description',
            aliases: 'Year: Unknown',
            airdate: 'Title: Unknown'
        }]);
    }
}

// Extract episodes function
async function extractEpisodes(url) {
    try {
        const responseText = await fetch(url);
        const document = parseHTML(responseText);
        
        // Extract scripts from container-video divs
        const scripts = document.select("div[id^=container-video] script");
        const scriptDataArray = [];
        
        for (const script of scripts) {
            scriptDataArray.push(script.data());
        }
        
        if (scriptDataArray.length === 0) {
            // No scripts found, might be a movie
            return JSON.stringify([{
                href: url,
                number: 1
            }]);
        }
        
        // Parse the script data to extract episode links
        const links = [];
        
        for (const scriptData of scriptDataArray) {
            // Extract data between brackets
            const dataStart = scriptData.indexOf("[");
            const dataEnd = scriptData.lastIndexOf("]");
            
            if (dataStart === -1 || dataEnd === -1) continue;
            
            let data = scriptData.substring(dataStart, dataEnd + 1);
            data = data.replace(/\'/g, '"');
            
            try {
                const parsed = JSON.parse(data);
                links.push(parsed);
            } catch (e) {
                console.log('Parse error:', e);
            }
        }
        
        if (links.length === 0) {
            // Fallback to single episode
            return JSON.stringify([{
                href: url,
                number: 1
            }]);
        }
        
        // Transpose the links array
        const transposed = transpose(links);
        const transposedAgain = transposed.map(inner => transpose(inner));
        
        // Flatten to episodes
        const episodes = [];
        let episodeNumber = 1;
        
        for (let season = 0; season < transposedAgain.length; season++) {
            const episodeList = transposedAgain[season];
            
            for (let episode = 0; episode < episodeList.length; episode++) {
                const iframes = episodeList[episode];
                
                episodes.push({
                    href: url + `#season=${season + 1}&episode=${episode + 1}`,
                    number: episodeNumber,
                    season: season + 1,
                    episodeNum: episode + 1,
                    links: iframes
                });
                
                episodeNumber++;
            }
        }
        
        return JSON.stringify(episodes);
        
    } catch (error) {
        console.log('Episodes error:', error);
        return JSON.stringify([{
            href: url,
            number: 1
        }]);
    }
}

// Extract stream URL function
async function extractStreamUrl(url) {
    try {
        // Parse the URL to get season and episode info
        const hashMatch = url.match(/#season=(\d+)&episode=(\d+)/);
        
        if (!hashMatch) {
            // Single movie or direct link
            const responseText = await fetch(url);
            const document = parseHTML(responseText);
            
            const scripts = document.select("div[id^=container-video] script");
            
            if (scripts.length === 0) {
                return null;
            }
            
            const scriptData = scripts[0].data();
            
            // Extract data between brackets
            const dataStart = scriptData.indexOf("[");
            const dataEnd = scriptData.lastIndexOf("]");
            
            if (dataStart === -1 || dataEnd === -1) {
                return null;
            }
            
            let data = scriptData.substring(dataStart, dataEnd + 1);
            data = data.replace(/\'/g, '"');
            
            try {
                const parsed = JSON.parse(data);
                
                if (parsed && parsed.length > 0 && parsed[0].length > 0) {
                    const link = parsed[0][0];
                    return link;
                }
            } catch (e) {
                console.log('Parse error:', e);
            }
            
            return null;
        }
        
        // Extract season and episode numbers
        const season = parseInt(hashMatch[1]);
        const episode = parseInt(hashMatch[2]);
        
        // Get the base URL
        const baseUrl = url.split('#')[0];
        
        const responseText = await fetch(baseUrl);
        const document = parseHTML(responseText);
        
        // Extract scripts from container-video divs
        const scripts = document.select("div[id^=container-video] script");
        const scriptDataArray = [];
        
        for (const script of scripts) {
            scriptDataArray.push(script.data());
        }
        
        // Parse the script data to extract episode links
        const links = [];
        
        for (const scriptData of scriptDataArray) {
            // Extract data between brackets
            const dataStart = scriptData.indexOf("[");
            const dataEnd = scriptData.lastIndexOf("]");
            
            if (dataStart === -1 || dataEnd === -1) continue;
            
            let data = scriptData.substring(dataStart, dataEnd + 1);
            data = data.replace(/\'/g, '"');
            
            try {
                const parsed = JSON.parse(data);
                links.push(parsed);
            } catch (e) {
                console.log('Parse error:', e);
            }
        }
        
        if (links.length === 0) {
            return null;
        }
        
        // Transpose the links array
        const transposed = transpose(links);
        const transposedAgain = transposed.map(inner => transpose(inner));
        
        // Get the specific episode's links
        if (season <= transposedAgain.length && episode <= transposedAgain[season - 1].length) {
            const iframes = transposedAgain[season - 1][episode - 1];
            
            if (iframes && iframes.length > 0) {
                // Return the first available link
                return iframes[0];
            }
        }
        
        return null;
        
    } catch (error) {
        console.log('Stream URL error:', error);
        return null;
    }
}
