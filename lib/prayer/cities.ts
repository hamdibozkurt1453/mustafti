/**
 * مدن مضمّنة لاختيار الموقع في المواقيت، بلا أي خدمة خارجية (لا بحث جغرافي على الشبكة).
 * أكبر مدن العالم الإسلامي وأوروبا وغيرها مما يكثر فيه المسلمون: الإحداثيات تقريبية لمركز المدينة،
 * والمنطقة الزمنية IANA لعرض الوقت بتوقيت المدينة نفسها.
 * id ثابت يُحفظ في المتصفح وفي profiles.city.
 */
export type City = { id: string; ar: string; en: string; country: string; lat: number; lng: number; tz: string };

// [id, الاسم بالعربية, الاسم بالإنجليزية, رمز البلد, خط العرض, خط الطول, المنطقة الزمنية]
type Row = [string, string, string, string, number, number, string];

const ROWS: Row[] = [
  // الحجاز والخليج
  ["makkah", "مكة المكرمة", "Makkah", "SA", 21.4225, 39.8262, "Asia/Riyadh"],
  ["madinah", "المدينة المنورة", "Madinah", "SA", 24.4672, 39.6111, "Asia/Riyadh"],
  ["riyadh", "الرياض", "Riyadh", "SA", 24.7136, 46.6753, "Asia/Riyadh"],
  ["jeddah", "جدة", "Jeddah", "SA", 21.4858, 39.1925, "Asia/Riyadh"],
  ["dammam", "الدمام", "Dammam", "SA", 26.4207, 50.0888, "Asia/Riyadh"],
  ["taif", "الطائف", "Taif", "SA", 21.2703, 40.4158, "Asia/Riyadh"],
  ["abha", "أبها", "Abha", "SA", 18.2164, 42.5053, "Asia/Riyadh"],
  ["kuwait", "الكويت", "Kuwait City", "KW", 29.3759, 47.9774, "Asia/Kuwait"],
  ["doha", "الدوحة", "Doha", "QA", 25.2854, 51.531, "Asia/Qatar"],
  ["manama", "المنامة", "Manama", "BH", 26.2285, 50.586, "Asia/Bahrain"],
  ["dubai", "دبي", "Dubai", "AE", 25.2048, 55.2708, "Asia/Dubai"],
  ["abudhabi", "أبوظبي", "Abu Dhabi", "AE", 24.4539, 54.3773, "Asia/Dubai"],
  ["sharjah", "الشارقة", "Sharjah", "AE", 25.3463, 55.4209, "Asia/Dubai"],
  ["muscat", "مسقط", "Muscat", "OM", 23.588, 58.3829, "Asia/Muscat"],
  ["sanaa", "صنعاء", "Sanaa", "YE", 15.3694, 44.191, "Asia/Aden"],
  ["aden", "عدن", "Aden", "YE", 12.7855, 45.0187, "Asia/Aden"],
  // الشام والعراق
  ["jerusalem", "القدس", "Jerusalem", "PS", 31.7767, 35.2345, "Asia/Jerusalem"],
  ["gaza", "غزة", "Gaza", "PS", 31.5017, 34.4668, "Asia/Gaza"],
  ["amman", "عمّان", "Amman", "JO", 31.9539, 35.9106, "Asia/Amman"],
  ["damascus", "دمشق", "Damascus", "SY", 33.5138, 36.2765, "Asia/Damascus"],
  ["aleppo", "حلب", "Aleppo", "SY", 36.2021, 37.1343, "Asia/Damascus"],
  ["beirut", "بيروت", "Beirut", "LB", 33.8938, 35.5018, "Asia/Beirut"],
  ["tripoli-lb", "طرابلس (لبنان)", "Tripoli (Lebanon)", "LB", 34.4367, 35.8497, "Asia/Beirut"],
  ["baghdad", "بغداد", "Baghdad", "IQ", 33.3152, 44.3661, "Asia/Baghdad"],
  ["basra", "البصرة", "Basra", "IQ", 30.5085, 47.7804, "Asia/Baghdad"],
  ["mosul", "الموصل", "Mosul", "IQ", 36.34, 43.13, "Asia/Baghdad"],
  ["erbil", "أربيل", "Erbil", "IQ", 36.1911, 44.0092, "Asia/Baghdad"],
  // مصر والسودان والمغرب العربي
  ["cairo", "القاهرة", "Cairo", "EG", 30.0444, 31.2357, "Africa/Cairo"],
  ["alexandria", "الإسكندرية", "Alexandria", "EG", 31.2001, 29.9187, "Africa/Cairo"],
  ["aswan", "أسوان", "Aswan", "EG", 24.0889, 32.8998, "Africa/Cairo"],
  ["khartoum", "الخرطوم", "Khartoum", "SD", 15.5007, 32.5599, "Africa/Khartoum"],
  ["tripoli-ly", "طرابلس (ليبيا)", "Tripoli (Libya)", "LY", 32.8872, 13.1913, "Africa/Tripoli"],
  ["benghazi", "بنغازي", "Benghazi", "LY", 32.1167, 20.0667, "Africa/Tripoli"],
  ["tunis", "تونس", "Tunis", "TN", 36.8065, 10.1815, "Africa/Tunis"],
  ["algiers", "الجزائر", "Algiers", "DZ", 36.7538, 3.0588, "Africa/Algiers"],
  ["oran", "وهران", "Oran", "DZ", 35.6971, -0.6308, "Africa/Algiers"],
  ["constantine", "قسنطينة", "Constantine", "DZ", 36.365, 6.6147, "Africa/Algiers"],
  ["rabat", "الرباط", "Rabat", "MA", 34.0209, -6.8416, "Africa/Casablanca"],
  ["casablanca", "الدار البيضاء", "Casablanca", "MA", 33.5731, -7.5898, "Africa/Casablanca"],
  ["fes", "فاس", "Fez", "MA", 34.0181, -5.0078, "Africa/Casablanca"],
  ["marrakesh", "مراكش", "Marrakesh", "MA", 31.6295, -7.9811, "Africa/Casablanca"],
  ["tangier", "طنجة", "Tangier", "MA", 35.7595, -5.834, "Africa/Casablanca"],
  ["nouakchott", "نواكشوط", "Nouakchott", "MR", 18.0735, -15.9582, "Africa/Nouakchott"],
  // أفريقيا
  ["mogadishu", "مقديشو", "Mogadishu", "SO", 2.0469, 45.3182, "Africa/Mogadishu"],
  ["djibouti", "جيبوتي", "Djibouti", "DJ", 11.5721, 43.1456, "Africa/Djibouti"],
  ["addisababa", "أديس أبابا", "Addis Ababa", "ET", 9.032, 38.7469, "Africa/Addis_Ababa"],
  ["nairobi", "نيروبي", "Nairobi", "KE", -1.2921, 36.8219, "Africa/Nairobi"],
  ["mombasa", "مومباسا", "Mombasa", "KE", -4.0435, 39.6682, "Africa/Nairobi"],
  ["daressalaam", "دار السلام", "Dar es Salaam", "TZ", -6.7924, 39.2083, "Africa/Dar_es_Salaam"],
  ["zanzibar", "زنجبار", "Zanzibar", "TZ", -6.1659, 39.2026, "Africa/Dar_es_Salaam"],
  ["kano", "كانو", "Kano", "NG", 12.0022, 8.592, "Africa/Lagos"],
  ["lagos", "لاغوس", "Lagos", "NG", 6.5244, 3.3792, "Africa/Lagos"],
  ["abuja", "أبوجا", "Abuja", "NG", 9.0765, 7.3986, "Africa/Lagos"],
  ["sokoto", "سوكوتو", "Sokoto", "NG", 13.0059, 5.2476, "Africa/Lagos"],
  ["niamey", "نيامي", "Niamey", "NE", 13.5116, 2.1254, "Africa/Niamey"],
  ["ndjamena", "إنجامينا", "N'Djamena", "TD", 12.1348, 15.0557, "Africa/Ndjamena"],
  ["dakar", "داكار", "Dakar", "SN", 14.7167, -17.4677, "Africa/Dakar"],
  ["bamako", "باماكو", "Bamako", "ML", 12.6392, -8.0029, "Africa/Bamako"],
  ["conakry", "كوناكري", "Conakry", "GN", 9.6412, -13.5784, "Africa/Conakry"],
  ["accra", "أكرا", "Accra", "GH", 5.6037, -0.187, "Africa/Accra"],
  ["johannesburg", "جوهانسبرغ", "Johannesburg", "ZA", -26.2041, 28.0473, "Africa/Johannesburg"],
  ["capetown", "كيب تاون", "Cape Town", "ZA", -33.9249, 18.4241, "Africa/Johannesburg"],
  // تركيا وإيران وآسيا الوسطى
  ["istanbul", "إسطنبول", "Istanbul", "TR", 41.0082, 28.9784, "Europe/Istanbul"],
  ["ankara", "أنقرة", "Ankara", "TR", 39.9334, 32.8597, "Europe/Istanbul"],
  ["izmir", "إزمير", "Izmir", "TR", 38.4237, 27.1428, "Europe/Istanbul"],
  ["bursa", "بورصة", "Bursa", "TR", 40.1885, 29.061, "Europe/Istanbul"],
  ["konya", "قونية", "Konya", "TR", 37.8746, 32.4932, "Europe/Istanbul"],
  ["gaziantep", "غازي عنتاب", "Gaziantep", "TR", 37.0662, 37.3833, "Europe/Istanbul"],
  ["tehran", "طهران", "Tehran", "IR", 35.6892, 51.389, "Asia/Tehran"],
  ["mashhad", "مشهد", "Mashhad", "IR", 36.2605, 59.6168, "Asia/Tehran"],
  ["tabriz", "تبريز", "Tabriz", "IR", 38.08, 46.2919, "Asia/Tehran"],
  ["baku", "باكو", "Baku", "AZ", 40.4093, 49.8671, "Asia/Baku"],
  ["kabul", "كابل", "Kabul", "AF", 34.5553, 69.2075, "Asia/Kabul"],
  ["tashkent", "طشقند", "Tashkent", "UZ", 41.2995, 69.2401, "Asia/Tashkent"],
  ["samarkand", "سمرقند", "Samarkand", "UZ", 39.6542, 66.9597, "Asia/Samarkand"],
  ["almaty", "ألماتي", "Almaty", "KZ", 43.222, 76.8512, "Asia/Almaty"],
  ["astana", "أستانا", "Astana", "KZ", 51.1694, 71.4491, "Asia/Almaty"],
  ["bishkek", "بشكيك", "Bishkek", "KG", 42.8746, 74.5698, "Asia/Bishkek"],
  ["dushanbe", "دوشنبه", "Dushanbe", "TJ", 38.5598, 68.787, "Asia/Dushanbe"],
  ["ashgabat", "عشق آباد", "Ashgabat", "TM", 37.9601, 58.3261, "Asia/Ashgabat"],
  // جنوب آسيا
  ["karachi", "كراتشي", "Karachi", "PK", 24.8607, 67.0011, "Asia/Karachi"],
  ["lahore", "لاهور", "Lahore", "PK", 31.5204, 74.3587, "Asia/Karachi"],
  ["islamabad", "إسلام آباد", "Islamabad", "PK", 33.6844, 73.0479, "Asia/Karachi"],
  ["peshawar", "بيشاور", "Peshawar", "PK", 34.0151, 71.5249, "Asia/Karachi"],
  ["faisalabad", "فيصل آباد", "Faisalabad", "PK", 31.4504, 73.135, "Asia/Karachi"],
  ["dhaka", "دكا", "Dhaka", "BD", 23.8103, 90.4125, "Asia/Dhaka"],
  ["chittagong", "شيتاغونغ", "Chittagong", "BD", 22.3569, 91.7832, "Asia/Dhaka"],
  ["delhi", "دلهي", "Delhi", "IN", 28.6139, 77.209, "Asia/Kolkata"],
  ["mumbai", "مومباي", "Mumbai", "IN", 19.076, 72.8777, "Asia/Kolkata"],
  ["hyderabad", "حيدر آباد", "Hyderabad", "IN", 17.385, 78.4867, "Asia/Kolkata"],
  ["kolkata", "كولكاتا", "Kolkata", "IN", 22.5726, 88.3639, "Asia/Kolkata"],
  ["srinagar", "سريناغار", "Srinagar", "IN", 34.0837, 74.7973, "Asia/Kolkata"],
  ["colombo", "كولومبو", "Colombo", "LK", 6.9271, 79.8612, "Asia/Colombo"],
  ["male", "ماليه", "Malé", "MV", 4.1755, 73.5093, "Indian/Maldives"],
  // جنوب شرق آسيا والصين
  ["jakarta", "جاكرتا", "Jakarta", "ID", -6.2088, 106.8456, "Asia/Jakarta"],
  ["surabaya", "سورابايا", "Surabaya", "ID", -7.2575, 112.7521, "Asia/Jakarta"],
  ["bandung", "باندونغ", "Bandung", "ID", -6.9175, 107.6191, "Asia/Jakarta"],
  ["medan", "ميدان", "Medan", "ID", 3.5952, 98.6722, "Asia/Jakarta"],
  ["bandaaceh", "باندا آتشيه", "Banda Aceh", "ID", 5.5483, 95.3238, "Asia/Jakarta"],
  ["makassar", "مكاسر", "Makassar", "ID", -5.1477, 119.4327, "Asia/Makassar"],
  ["kualalumpur", "كوالالمبور", "Kuala Lumpur", "MY", 3.139, 101.6869, "Asia/Kuala_Lumpur"],
  ["penang", "بينانغ", "George Town (Penang)", "MY", 5.4141, 100.3288, "Asia/Kuala_Lumpur"],
  ["kotabharu", "كوتا بهارو", "Kota Bharu", "MY", 6.1254, 102.2381, "Asia/Kuala_Lumpur"],
  ["singapore", "سنغافورة", "Singapore", "SG", 1.3521, 103.8198, "Asia/Singapore"],
  ["bandarseribegawan", "بندر سري بكاوان", "Bandar Seri Begawan", "BN", 4.9031, 114.9398, "Asia/Brunei"],
  ["bangkok", "بانكوك", "Bangkok", "TH", 13.7563, 100.5018, "Asia/Bangkok"],
  ["manila", "مانيلا", "Manila", "PH", 14.5995, 120.9842, "Asia/Manila"],
  ["marawi", "مراوي", "Marawi", "PH", 8.0034, 124.2839, "Asia/Manila"],
  ["beijing", "بكين", "Beijing", "CN", 39.9042, 116.4074, "Asia/Shanghai"],
  ["urumqi", "أورومتشي", "Urumqi", "CN", 43.8256, 87.6168, "Asia/Urumqi"],
  ["tokyo", "طوكيو", "Tokyo", "JP", 35.6762, 139.6503, "Asia/Tokyo"],
  ["seoul", "سيول", "Seoul", "KR", 37.5665, 126.978, "Asia/Seoul"],
  // روسيا والقوقاز
  ["moscow", "موسكو", "Moscow", "RU", 55.7558, 37.6173, "Europe/Moscow"],
  ["kazan", "قازان", "Kazan", "RU", 55.7887, 49.1221, "Europe/Moscow"],
  ["ufa", "أوفا", "Ufa", "RU", 54.7388, 55.9721, "Asia/Yekaterinburg"],
  ["grozny", "غروزني", "Grozny", "RU", 43.3178, 45.6949, "Europe/Moscow"],
  ["makhachkala", "محج قلعة", "Makhachkala", "RU", 42.9849, 47.5047, "Europe/Moscow"],
  ["stpetersburg", "سانت بطرسبرغ", "Saint Petersburg", "RU", 59.9311, 30.3609, "Europe/Moscow"],
  // البلقان
  ["sarajevo", "سراييفو", "Sarajevo", "BA", 43.8563, 18.4131, "Europe/Sarajevo"],
  ["tirana", "تيرانا", "Tirana", "AL", 41.3275, 19.8187, "Europe/Tirane"],
  ["pristina", "بريشتينا", "Pristina", "XK", 42.6629, 21.1655, "Europe/Belgrade"],
  ["skopje", "سكوبيه", "Skopje", "MK", 41.9981, 21.4254, "Europe/Skopje"],
  ["sofia", "صوفيا", "Sofia", "BG", 42.6977, 23.3219, "Europe/Sofia"],
  ["athens", "أثينا", "Athens", "GR", 37.9838, 23.7275, "Europe/Athens"],
  // أوروبا الغربية والشمالية
  ["london", "لندن", "London", "GB", 51.5074, -0.1278, "Europe/London"],
  ["birmingham", "برمنغهام", "Birmingham", "GB", 52.4862, -1.8904, "Europe/London"],
  ["manchester", "مانشستر", "Manchester", "GB", 53.4808, -2.2426, "Europe/London"],
  ["glasgow", "غلاسكو", "Glasgow", "GB", 55.8642, -4.2518, "Europe/London"],
  ["dublin", "دبلن", "Dublin", "IE", 53.3498, -6.2603, "Europe/Dublin"],
  ["paris", "باريس", "Paris", "FR", 48.8566, 2.3522, "Europe/Paris"],
  ["marseille", "مرسيليا", "Marseille", "FR", 43.2965, 5.3698, "Europe/Paris"],
  ["lyon", "ليون", "Lyon", "FR", 45.764, 4.8357, "Europe/Paris"],
  ["lille", "ليل", "Lille", "FR", 50.6292, 3.0573, "Europe/Paris"],
  ["toulouse", "تولوز", "Toulouse", "FR", 43.6047, 1.4442, "Europe/Paris"],
  ["strasbourg", "ستراسبورغ", "Strasbourg", "FR", 48.5734, 7.7521, "Europe/Paris"],
  ["brussels", "بروكسل", "Brussels", "BE", 50.8503, 4.3517, "Europe/Brussels"],
  ["antwerp", "أنتويرب", "Antwerp", "BE", 51.2194, 4.4025, "Europe/Brussels"],
  ["amsterdam", "أمستردام", "Amsterdam", "NL", 52.3676, 4.9041, "Europe/Amsterdam"],
  ["rotterdam", "روتردام", "Rotterdam", "NL", 51.9244, 4.4777, "Europe/Amsterdam"],
  ["thehague", "لاهاي", "The Hague", "NL", 52.0705, 4.3007, "Europe/Amsterdam"],
  ["luxembourg", "لوكسمبورغ", "Luxembourg", "LU", 49.6116, 6.1319, "Europe/Luxembourg"],
  ["berlin", "برلين", "Berlin", "DE", 52.52, 13.405, "Europe/Berlin"],
  ["hamburg", "هامبورغ", "Hamburg", "DE", 53.5511, 9.9937, "Europe/Berlin"],
  ["munich", "ميونخ", "Munich", "DE", 48.1351, 11.582, "Europe/Berlin"],
  ["cologne", "كولونيا", "Cologne", "DE", 50.9375, 6.9603, "Europe/Berlin"],
  ["frankfurt", "فرانكفورت", "Frankfurt", "DE", 50.1109, 8.6821, "Europe/Berlin"],
  ["stuttgart", "شتوتغارت", "Stuttgart", "DE", 48.7758, 9.1829, "Europe/Berlin"],
  ["duisburg", "دويسبورغ", "Duisburg", "DE", 51.4344, 6.7623, "Europe/Berlin"],
  ["vienna", "فيينا", "Vienna", "AT", 48.2082, 16.3738, "Europe/Vienna"],
  ["zurich", "زيورخ", "Zurich", "CH", 47.3769, 8.5417, "Europe/Zurich"],
  ["geneva", "جنيف", "Geneva", "CH", 46.2044, 6.1432, "Europe/Zurich"],
  ["copenhagen", "كوبنهاغن", "Copenhagen", "DK", 55.6761, 12.5683, "Europe/Copenhagen"],
  ["stockholm", "ستوكهولم", "Stockholm", "SE", 59.3293, 18.0686, "Europe/Stockholm"],
  ["malmo", "مالمو", "Malmö", "SE", 55.605, 13.0038, "Europe/Stockholm"],
  ["gothenburg", "غوتنبرغ", "Gothenburg", "SE", 57.7089, 11.9746, "Europe/Stockholm"],
  ["oslo", "أوسلو", "Oslo", "NO", 59.9139, 10.7522, "Europe/Oslo"],
  ["helsinki", "هلسنكي", "Helsinki", "FI", 60.1699, 24.9384, "Europe/Helsinki"],
  ["madrid", "مدريد", "Madrid", "ES", 40.4168, -3.7038, "Europe/Madrid"],
  ["barcelona", "برشلونة", "Barcelona", "ES", 41.3874, 2.1686, "Europe/Madrid"],
  ["granada", "غرناطة", "Granada", "ES", 37.1773, -3.5986, "Europe/Madrid"],
  ["cordoba", "قرطبة", "Córdoba", "ES", 37.8882, -4.7794, "Europe/Madrid"],
  ["ceuta", "سبتة", "Ceuta", "ES", 35.8894, -5.3213, "Europe/Madrid"],
  ["lisbon", "لشبونة", "Lisbon", "PT", 38.7223, -9.1393, "Europe/Lisbon"],
  ["rome", "روما", "Rome", "IT", 41.9028, 12.4964, "Europe/Rome"],
  ["milan", "ميلانو", "Milan", "IT", 45.4642, 9.19, "Europe/Rome"],
  ["palermo", "باليرمو", "Palermo", "IT", 38.1157, 13.3615, "Europe/Rome"],
  ["warsaw", "وارسو", "Warsaw", "PL", 52.2297, 21.0122, "Europe/Warsaw"],
  ["prague", "براغ", "Prague", "CZ", 50.0755, 14.4378, "Europe/Prague"],
  ["budapest", "بودابست", "Budapest", "HU", 47.4979, 19.0402, "Europe/Budapest"],
  ["bucharest", "بوخارست", "Bucharest", "RO", 44.4268, 26.1025, "Europe/Bucharest"],
  ["kyiv", "كييف", "Kyiv", "UA", 50.4501, 30.5234, "Europe/Kyiv"],
  ["simferopol", "سيمفيروبول", "Simferopol", "UA", 44.9521, 34.1024, "Europe/Simferopol"],
  // الأمريكتان وأستراليا
  ["newyork", "نيويورك", "New York", "US", 40.7128, -74.006, "America/New_York"],
  ["dearborn", "ديربورن", "Dearborn", "US", 42.3223, -83.1763, "America/Detroit"],
  ["chicago", "شيكاغو", "Chicago", "US", 41.8781, -87.6298, "America/Chicago"],
  ["houston", "هيوستن", "Houston", "US", 29.7604, -95.3698, "America/Chicago"],
  ["losangeles", "لوس أنجلوس", "Los Angeles", "US", 34.0522, -118.2437, "America/Los_Angeles"],
  ["washington", "واشنطن", "Washington, D.C.", "US", 38.9072, -77.0369, "America/New_York"],
  ["toronto", "تورونتو", "Toronto", "CA", 43.6532, -79.3832, "America/Toronto"],
  ["montreal", "مونتريال", "Montreal", "CA", 45.5017, -73.5673, "America/Toronto"],
  ["saopaulo", "ساو باولو", "São Paulo", "BR", -23.5505, -46.6333, "America/Sao_Paulo"],
  ["buenosaires", "بوينس آيرس", "Buenos Aires", "AR", -34.6037, -58.3816, "America/Argentina/Buenos_Aires"],
  ["sydney", "سيدني", "Sydney", "AU", -33.8688, 151.2093, "Australia/Sydney"],
  ["melbourne", "ملبورن", "Melbourne", "AU", -37.8136, 144.9631, "Australia/Melbourne"],
];

export const CITIES: City[] = ROWS.map(([id, ar, en, country, lat, lng, tz]) => ({ id, ar, en, country, lat, lng, tz }));

export const DEFAULT_CITY_ID = "makkah";

export function cityById(id: string | null | undefined): City | undefined {
  return id ? CITIES.find((c) => c.id === id) : undefined;
}

/** يوحّد النص للبحث: بلا تشكيل ولا همزات ولا علامات لاتينية، وبحروف صغيرة. */
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u064B-\u0655\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/['’.,()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** يبحث في الاسمين العربي والإنجليزي ورمز البلد. ما يبدأ بالنص أولاً. */
export function searchCities(query: string, max = 8): City[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const scored: { c: City; s: number }[] = [];
  for (const c of CITIES) {
    const names = [normalizeSearch(c.ar), normalizeSearch(c.en)];
    if (names.some((n) => n.startsWith(q))) scored.push({ c, s: 0 });
    else if (names.some((n) => n.includes(q))) scored.push({ c, s: 1 });
    else if (c.country.toLowerCase() === q) scored.push({ c, s: 2 });
  }
  return scored.sort((a, b) => a.s - b.s).slice(0, max).map((x) => x.c);
}
