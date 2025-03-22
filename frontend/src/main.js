// Переменная для хранения анимации загрузки
let loadingAnimation = null;

// Переменная для хранения времени начала загрузки
let loadingStartTime;

// Функция для инициализации Lottie-анимации загрузки
function initializeLoadingAnimation() {
  const container = document.getElementById("loading-lottie");
  if (!container) {
    console.warn("Loading Lottie container not found");
    return;
  }

  loadingAnimation = lottie.loadAnimation({
    container: container,
    renderer: "svg",
    loop: true,
    autoplay: true,
    path: "public/loading-animation.json",
  });

  loadingAnimation.addEventListener("data_ready", () => {
    console.log("Loading animation data ready");
  });
  loadingAnimation.addEventListener("DOMLoaded", () => {
    console.log("Loading animation DOM loaded");
  });
}

// Функция для скрытия спиннера
function hideLoadingSpinner() {
  const spinner = document.getElementById("loading-spinner");
  if (spinner) {
    spinner.style.display = "none";
    if (loadingAnimation) {
      loadingAnimation.stop();
    }
  }
}

// Функция для скрытия спиннера с фиксированной задержкой
function hideLoadingSpinnerWithDelay() {
  const loadingDuration = 3500; // 3.5 секунды
  const elapsedTime = Date.now() - loadingStartTime;
  const remainingTime = Math.max(0, loadingDuration - elapsedTime);

  setTimeout(() => {
    hideLoadingSpinner();
  }, remainingTime);
}

// Функция для сохранения состояния
function saveState(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Функция для получения состояния
function getState(key) {
  const storedValue = localStorage.getItem(key);
  return storedValue ? JSON.parse(storedValue) : null;
}

// Функция для отображения уведомлений
function showNotification(message, type = "error") {
  if (type !== "success" && type !== "info") return;

  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 5000);
}

// Функция для создания анимации сердечек
function spawnHearts(button) {
  const heartsRow = button.closest(".hearts-row");
  if (!heartsRow) return;

  const heartIcon = heartsRow.querySelector(".heart-icon");
  if (!heartIcon) return;

  const heart = document.createElement("span");
  heart.classList.add("heart");
  heart.innerHTML = "💙";

  const randomX = (Math.random() - 0.5) * 50;
  heart.style.setProperty("--random-x", `${randomX}px`);

  heartsRow.appendChild(heart);

  setTimeout(() => heart.remove(), 1500);
}

// Функция форматирования чисел
function formatNumber(value) {
  if (value >= 1000) return (value / 1000).toFixed(1).replace(".0", "") + "k";
  return value.toString();
}

// Обновление отображения энергии
function updateEnergyDisplay(energy) {
  const energyCountElement = document.querySelector(".energy-count");
  const energyBarElement = document.querySelector(".progress-bar.energy-bar");

  if (energyCountElement) {
    energy = Math.max(0, Math.min(100, energy));
    energyCountElement.textContent = `${energy}/100`;
  }

  if (energyBarElement) {
    energy = Math.max(0, Math.min(100, energy));
    const scale = energy / 100;
    energyBarElement.style.setProperty("--energy-scale", scale);
  }
}

// Универсальная функция обновления интерфейса
function updateUIDisplay(data) {
  const ticketsCountElement = document.querySelector(".tickets-count");
  const heartsCountElement = document.querySelector(".hearts-count");
  if (ticketsCountElement) ticketsCountElement.textContent = data.points.tickets || "0";
  if (heartsCountElement) heartsCountElement.textContent = formatNumber(data.points.hearts || 0);
  updateEnergyDisplay(data.points.energy || 0);

  const airdropDescription = document.querySelector("#laboratory .asset-item .asset-description");
  const airdropAmount = document.querySelector("#laboratory .asset-item .asset-amount");
  if (airdropDescription && airdropAmount) {
    const points = formatNumber(data.points.points || 0);
    airdropDescription.textContent = `${points} points`;
    airdropAmount.textContent = points;
  }
}

// Обновление количества рефералов
async function updateReferralCount(initData) {
  if (!telegramUserId) {
    console.warn("Cannot fetch referrals: telegramUserId is not set.");
    return;
  }
  const referrals = await fetchData(`/api/v1/referrals?user_id=${telegramUserId}`, "GET", null, initData);
  const inviteCountElement = document.querySelector(".stats-row .invite-count");
  if (inviteCountElement && referrals) inviteCountElement.textContent = `+${referrals.referrals.length || 0}`;
}

// Функция для форматирования адреса кошелька
function formatWalletAddress(address) {
  if (!address || address.length < 6) return address;
  return `${address.slice(0, 3)}...${address.slice(-3)}`;
}

// Подготовка к подключению кошелька
function connectWallet() {
  const mockAddress = "AD2xyz789abcDEF456ghiJKL789a4G";
  saveState("walletAddress", mockAddress);
  updateWalletDisplay(mockAddress);
}

// Обновление отображения кошелька
function updateWalletDisplay(address) {
  const connectButton = document.getElementById("connect-wallet");
  if (connectButton) {
    if (address) {
      connectButton.classList.add("connected");
      connectButton.classList.remove("connect-wallet-button");
      connectButton.classList.add("wallet-address");
      connectButton.textContent = formatWalletAddress(address);
      connectButton.disabled = true;
    } else {
      connectButton.classList.remove("connected", "wallet-address");
      connectButton.classList.add("connect-wallet-button");
      connectButton.textContent = "Connect Wallet";
      connectButton.disabled = false;
    }
  }
}

// Telegram WebApp Integration
let telegramUserId = null;
let globalInitData = "";
let telegramApp = null;
let currentPage = getState("activePage") || "home";
let rewardAnimations = {};

function startPeriodicUpdate() {
  const updateInterval = 30000;
  setInterval(async () => {
    if (!globalInitData) {
      console.warn("Cannot perform periodic update: globalInitData is not set.");
      return;
    }
    const data = await fetchData(`/api/v1/auth/login`, "POST", null, globalInitData);
    if (data && data.points) updateUIDisplay(data);
  }, updateInterval);
}

// Функция для вызова методов Telegram Mini Apps
function postTelegramEvent(eventType, eventData) {
  if (!telegramApp) {
    console.error("Telegram.WebApp not initialized. Cannot post event:", eventType);
    return false;
  }

  // Проверяем версию Telegram для метода
  const methodVersions = {
    "web_app_start_accelerometer": "8.0",
    "web_app_stop_accelerometer": "8.0",
    "web_app_trigger_haptic_feedback": "6.1",
  };

  const requiredVersion = methodVersions[eventType];
  if (requiredVersion && !telegramApp.isVersionAtLeast(requiredVersion)) {
    console.warn(`Method ${eventType} requires Telegram version ${requiredVersion} or higher. Current version: ${telegramApp.version}`);
    return false;
  }

  try {
    // Web версия: используем window.parent.postMessage
    if (window.parent && telegramApp.platform === "web") {
      const data = JSON.stringify({
        eventType: eventType,
        eventData: eventData || {},
      });
      window.parent.postMessage(data, "https://web.telegram.org");
      console.log(`Posted event to web: ${eventType}`, eventData);
    }
    // Desktop и Mobile: используем window.TelegramWebviewProxy.postEvent
    else if (window.TelegramWebviewProxy) {
      const data = JSON.stringify(eventData || {});
      window.TelegramWebviewProxy.postEvent(eventType, data);
      console.log(`Posted event to TelegramWebviewProxy: ${eventType}`, eventData);
    }
    // Windows Phone: используем window.external.notify
    else if (window.external && window.external.notify) {
      const data = JSON.stringify({
        eventType: eventType,
        eventData: eventData || {},
      });
      window.external.notify(data);
      console.log(`Posted event to Windows Phone: ${eventType}`, eventData);
    }
    // Если платформа неизвестна, пробуем использовать @telegram-apps/sdk стиль
    else {
      telegramApp.postEvent(eventType, eventData || {});
      console.log(`Posted event using Telegram.WebApp.postEvent: ${eventType}`, eventData);
    }
    return true;
  } catch (error) {
    console.error(`Failed to post event ${eventType}:`, error.message);
    return false;
  }
}

// Инициализация Telegram с использованием window.Telegram.WebApp
async function initTelegram() {
  // Ждём, пока window.Telegram.WebApp станет доступным
  const waitForTelegramWebApp = () => {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 секунд (50 * 100ms)
      const checkInterval = setInterval(() => {
        attempts++;
        console.log(`Attempt ${attempts}: Checking for window.Telegram.WebApp...`);
        console.log("window.Telegram:", window.Telegram);
        console.log("window.Telegram.WebApp:", window.Telegram?.WebApp);
        console.log("User Agent:", navigator.userAgent);
        if (window.Telegram?.WebApp) {
          console.log(`Telegram.WebApp loaded after ${attempts * 100}ms`);
          clearInterval(checkInterval);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          console.error(`Telegram.WebApp failed to load after ${attempts * 100}ms`);
          console.log("Final window.Telegram:", window.Telegram);
          console.log("Final window.Telegram.WebApp:", window.Telegram?.WebApp);
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  };

  const isLoaded = await waitForTelegramWebApp();
  if (!isLoaded) {
    console.error("Telegram.WebApp not available. Running in mock mode.");
    showNotification("Failed to load Telegram SDK. Please try again later.", "error");
    // Mock mode
    telegramUserId = 1;
    const profileName = document.getElementById("profile-name");
    if (profileName) profileName.textContent = "TestUser";
    const profileAvatar = document.getElementById("profile-avatar");
    if (profileAvatar) profileAvatar.src = "/public/default-avatar.png";
    const profileId = document.querySelector(".profile-id");
    if (profileId) profileId.textContent = `ID ${telegramUserId}`;
    startPeriodicUpdate();
    return false;
  }

  try {
    telegramApp = window.Telegram.WebApp;
    telegramApp.ready();
    console.log("Telegram.WebApp initialized:", telegramApp);
    console.log("Telegram.WebApp version:", telegramApp.version);
    console.log("Telegram.WebApp platform:", telegramApp.platform);
    globalInitData = telegramApp.initData || "";
    console.log("Init data from Telegram.WebApp:", globalInitData);

    // Инициализация Telegram функций
    telegramApp.expand();
    telegramApp.BackButton.show();

    const user = telegramApp.initDataUnsafe?.user;
    if (user) {
      telegramUserId = user.id;
      console.log("User data from Telegram.WebApp:", user);
      const profileName = document.getElementById("profile-name");
      if (profileName) profileName.textContent = user.first_name || "User";

      const profileAvatar = document.getElementById("profile-avatar");
      if (profileAvatar) {
        profileAvatar.src = user.photo_url || "/public/default-avatar.png";
        profileAvatar.onerror = () => {
          profileAvatar.src = "/public/default-avatar.png";
          profileAvatar.onerror = null;
        };
      }

      const profileId = document.querySelector(".profile-id");
      if (profileId) profileId.textContent = `ID ${telegramUserId}`;
    } else {
      console.warn("User data not available from Telegram.WebApp. Running in mock mode.");
      telegramUserId = 1;
      const profileName = document.getElementById("profile-name");
      if (profileName) profileName.textContent = "TestUser";
      const profileAvatar = document.getElementById("profile-avatar");
      if (profileAvatar) profileAvatar.src = "/public/default-avatar.png";
      const profileId = document.querySelector(".profile-id");
      if (profileId) profileId.textContent = `ID ${telegramUserId}`;
    }

    // Слушаем события через Telegram.WebApp
    telegramApp.onEvent("backButtonClicked", () => {
      if (currentPage !== "home") openPage("home");
    });

    telegramApp.onEvent("themeChanged", () => {
      document.body.style.backgroundColor = telegramApp.themeParams.bg_color || "#F8F8F8";
    });

    telegramApp.onEvent("viewportChanged", (payload) => {
      if (!payload.is_expanded) telegramApp.expand();
    });

    // Добавляем обработчики событий для акселерометра
    telegramApp.onEvent("accelerometer_changed", (data) => {
      console.log("Accelerometer data changed:", data);
      const speed = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
      handleShake(speed);
    });

    telegramApp.onEvent("accelerometer_started", () => {
      console.log("Accelerometer started tracking.");
    });

    telegramApp.onEvent("accelerometer_stopped", () => {
      console.log("Accelerometer stopped tracking.");
    });

    telegramApp.onEvent("accelerometer_failed", (params) => {
      console.error("Accelerometer failed:", params.error);
      showNotification("Failed to access accelerometer. Falling back to DeviceMotionEvent.", "error");
      // Если Telegram API не поддерживает акселерометр, переходим на DeviceMotionEvent
      setupShakeToEarnFallback();
    });

    startPeriodicUpdate();
    return true;
  } catch (error) {
    console.error("Failed to initialize Telegram.WebApp:", error.message);
    showNotification("Failed to initialize Telegram SDK.", "error");

    // Mock mode
    telegramUserId = 1;
    const profileName = document.getElementById("profile-name");
    if (profileName) profileName.textContent = "TestUser";
    const profileAvatar = document.getElementById("profile-avatar");
    if (profileAvatar) profileAvatar.src = "/public/default-avatar.png";
    const profileId = document.querySelector(".profile-id");
    if (profileId) profileId.textContent = `ID ${telegramUserId}`;
    startPeriodicUpdate();
    return false;
  }
}

async function fetchData(endpoint, method = "GET", body = null, initData = globalInitData) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const backendUrl = "https://laboratory-back.vercel.app";
    const headers = { "Content-Type": "application/json" };
    if (initData) {
      headers["Authorization"] = `tma ${initData}`;
    } else {
      console.warn("No initData provided for Authorization header. Request might fail.");
      return null; // Прерываем запрос, если initData отсутствует
    }
    const options = { method, headers, signal: controller.signal };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${backendUrl}${endpoint}`, options);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch ${endpoint}: ${response.status} - ${errorText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Error fetching ${endpoint}:`, error.message);
    hideLoadingSpinner();
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Обновлённая функция fetchUserData с фиксированной задержкой
async function fetchUserData(initData) {
  if (!initData) {
    console.warn("Cannot fetch user data: initData is not set.");
    updateEnergyDisplay(0);
    hideLoadingSpinnerWithDelay();
    return;
  }

  loadingStartTime = Date.now(); // Записываем время начала загрузки

  const data = await fetchData(`/api/v1/auth/login`, "POST", null, initData);
  if (data && data.user) {
    console.log("Fetched user data:", data);
    console.log("Energy value:", data.points.energy);
    updateUIDisplay(data);
    await fetchData("/webhook", "POST", { user_id: telegramUserId, event: "login" }, initData);

    let referrerId = null;
    if (telegramApp) {
      const startParam = telegramApp.initDataUnsafe.start_param;
      if (startParam && startParam.startsWith("ref_")) referrerId = startParam.replace("ref_", "");
    }
    if (referrerId) {
      const registerResult = await fetchData(
        `/api/v1/referrals/register`,
        "POST",
        { user_id: telegramUserId, referrer_id: referrerId },
        initData
      );
      if (registerResult) {
        const updatedData = await fetchData(`/api/v1/auth/login`, "POST", null, initData);
        if (updatedData && updatedData.points) {
          updateUIDisplay(updatedData);
          updateReferralCount(initData);
        }
      }
    }
  } else {
    updateEnergyDisplay(0);
  }
  hideLoadingSpinnerWithDelay(); // Скрываем с задержкой
}

let lottieAnimationsLoaded = {
  community: false,
  checkmark: false,
  shakeTop: false,
  paint: false,
  legendary: false,
  mythical: false,
  epic: false,
};

async function loadLottieJSON(path) {
  const cachedData = getState(`lottie_${path}`);
  if (cachedData) {
    console.log(`Using cached Lottie data for ${path}:`, cachedData);
    return cachedData;
  }

  const baseUrl = "https://laboratory-front.vercel.app";
  const fullUrl = `${baseUrl}${path}?v=${Date.now()}`;

  try {
    console.log(`Fetching Lottie JSON from: ${fullUrl} for user ${telegramUserId}`);
    const response = await fetch(fullUrl, { mode: "cors" });
    if (!response.ok) throw new Error(`Failed to fetch ${fullUrl}: ${response.status} - ${await response.text()}`);
    const data = await response.json();
    console.log(`Successfully fetched Lottie JSON for ${path} for user ${telegramUserId}`);
    saveState(`lottie_${path}`, data);
    return data;
  } catch (error) {
    console.error(`Error loading Lottie JSON from ${path} for user ${telegramUserId}:`, error.message);
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      console.log(`Retrying Lottie JSON load for iOS from ${fullUrl} for user ${telegramUserId}`);
      try {
        const retryResponse = await fetch(fullUrl, { mode: "cors" });
        if (!retryResponse.ok) throw new Error(`Retry failed for ${fullUrl}: ${retryResponse.status}`);
        const retryData = await retryResponse.json();
        saveState(`lottie_${path}`, retryData);
        console.log(`Retry successful for ${path} for user ${telegramUserId}`);
        return retryData;
      } catch (retryError) {
        console.error(`Retry failed for ${path} for user ${telegramUserId}:`, retryError.message);
        return null;
      }
    }
    return null;
  }
}

async function loadLootboxesJSON() {
  const path = "/lootboxes.json";
  const cachedData = getState(`lootboxes_${path}`);
  if (cachedData) return cachedData;

  const baseUrl = "https://laboratory-front.vercel.app";
  const fullUrl = `${baseUrl}${path}?v=${Date.now()}`;

  try {
    console.log("Fetching Lootboxes JSON from:", fullUrl);
    const response = await fetch(fullUrl, { mode: "cors" });
    if (!response.ok) throw new Error(`Failed to fetch ${fullUrl}: ${response.status} - ${await response.text()}`);
    const data = await response.json();
    saveState(`lootboxes_${path}`, data);
    return data;
  } catch (error) {
    console.error(`Error loading Lootboxes JSON from ${path}:`, error.message);
    return [];
  }
}

async function initializeLottie(containerId, path, loop, autoplay) {
  const container = document.getElementById(containerId);
  if (!container || !isElementVisible(container)) {
    console.warn(`Lottie container ${containerId} not found or not visible`);
    return null;
  }

  const animationData = await loadLottieJSON(path);
  if (!animationData) return null;

  return lottie.loadAnimation({
    container,
    renderer: "svg",
    loop,
    autoplay,
    animationData,
    rendererSettings: { preserveAspectRatio: "xMidYMid meet", clearCanvas: true },
  });
}

async function initializeRewardLottie(container, path, id) {
  return loadLottieJSON(path).then((data) => {
    if (!data || !container) {
      console.warn(`Failed to initialize Lottie for ${id}: No data or container`);
      return null;
    }

    const animation = lottie.loadAnimation({
      container,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData: data,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet", clearCanvas: true },
    });

    rewardAnimations[id] = animation;
    return animation;
  }).catch((error) => {
    console.error(`Error initializing Lottie for ${id}:`, error.message);
    return null;
  });
}

function isElementVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.offsetParent !== null;
}

function clearLottieCache() {
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith("lottie_") || key.startsWith("lootboxes_")) {
      localStorage.removeItem(key);
      console.log(`Cleared cache for ${key}`);
    }
  });
}

async function openPage(page, isBackNavigation = false, initData = globalInitData) {
  console.log("Opening page:", page);
  currentPage = page;
  saveState("activePage", page);

  document.querySelectorAll(".page").forEach((p) => {
    p.classList.remove("active");
    p.classList.add("hidden");
  });

  const targetPage = document.getElementById(page);
  if (targetPage) {
    targetPage.classList.remove("hidden");
    targetPage.classList.add("active");
  } else {
    console.log("Page not found, redirecting to home");
    openPage("home", true);
    return;
  }

  document.querySelectorAll(".menu button").forEach((button) => button.classList.remove("active"));
  const activeMenuButton = document.querySelector(`.menu button[data-page="${page}"]`);
  if (activeMenuButton) activeMenuButton.classList.add("active");

  if (!isBackNavigation) history.pushState({ page }, "", "#" + page);

  if (!lottieAnimationsLoaded.paint) {
    const paintLottie = document.getElementById("paint-lottie");
    if (paintLottie && isElementVisible(paintLottie)) {
      initializeLottie("paint-lottie", "/paint-animation.json", true, true).then(() => {
        lottieAnimationsLoaded.paint = true;
      });
    }
  }
  if (!lottieAnimationsLoaded.community) {
    const communityLottie = document.getElementById("community-lottie");
    if (communityLottie && isElementVisible(communityLottie)) {
      initializeLottie("community-lottie", "/community-animation.json", true, true).then(() => {
        lottieAnimationsLoaded.community = true;
      });
    }
  }
  if (!lottieAnimationsLoaded.checkmark) {
    const checkmarkLottie = document.getElementById("checkmark-lottie");
    if (checkmarkLottie && isElementVisible(checkmarkLottie)) {
      initializeLottie("checkmark-lottie", "/checkmark-animation.json", false, true).then(() => {
        lottieAnimationsLoaded.checkmark = true;
      });
    }
  }
  if (!lottieAnimationsLoaded.shakeTop && page === "earn") {
    const shakeTopLottie = document.getElementById("shake-top-lottie");
    if (shakeTopLottie && isElementVisible(shakeTopLottie)) {
      initializeLottie("shake-top-lottie", "/shake-top-animation.json", true, true).then((animation) => {
        if (animation) lottieAnimationsLoaded.shakeTop = true;
      });
    }
  }

  if (page === "roulette") {
    clearLottieCache();
    const lootboxes = await loadLootboxesJSON();
    displayLootboxes(lootboxes);
  }

  if (page.startsWith("lootbox-details-") || page === "rewards") {
    const rouletteContainers = document.querySelectorAll(".roulette-animation");
    rouletteContainers.forEach((container) => {
      const id = container.getAttribute("data-type");
      if (id && !rewardAnimations[id]) {
        initializeRewardLottie(container, `/lottie/${id}.json`, id);
      }
    });

    const rewardContainers = document.querySelectorAll(".reward-animation");
    rewardContainers.forEach((container) => {
      const item = container.parentElement;
      const id = item.getAttribute("data-id");
      if (id && !rewardAnimations[id]) {
        initializeRewardLottie(container, `/lottie/${id}.json`, id);
      }
    });
  }

  if (!initData) {
    console.warn("Cannot fetch user data for page update: initData is not set.");
    updateEnergyDisplay(0);
    return;
  }

  const data = await fetchData(`/api/v1/auth/login`, "POST", null, initData);
  if (data) {
    updateUIDisplay(data);
    if (page === "home") updateReferralCount(initData);
    else if (page === "earn") {
      const referrals = await fetchData(`/api/v1/referrals?user_id=${telegramUserId}`, "GET", null, initData);
      displayReferrals(referrals?.referrals || []);
    }
  } else {
    updateEnergyDisplay(0);
  }
}

function displayReferrals(referrals) {
  const referralsList = document.getElementById("referrals-list-items");
  if (!referralsList) return;

  const fragment = document.createDocumentFragment();
  if (referrals.length > 0) {
    referrals.forEach((referral) => {
      const referralItem = document.createElement("li");
      referralItem.innerHTML = `
        <img src="${referral.photo_url || "/TGImage.svg"}" alt="User Avatar" onerror="this.src='/default-icon.svg'; this.onerror=null;" />
        <span>${referral.username || referral.first_name || "Name Tag"}</span>
      `;
      fragment.appendChild(referralItem);
    });
  } else {
    const noReferralsItem = document.createElement("li");
    noReferralsItem.textContent = "No referrals yet.";
    fragment.appendChild(noReferralsItem);
  }

  referralsList.innerHTML = "";
  referralsList.appendChild(fragment);
}

let lootboxAnimations = {};

function displayLootboxes(lootboxes) {
  const lootboxesList = document.getElementById("lootboxes-list");
  if (!lootboxesList) return;

  Object.values(lootboxAnimations).forEach((animation) => animation.destroy());
  lootboxAnimations = {};

  const fragment = document.createDocumentFragment();
  if (lootboxes.length > 0) {
    lootboxes.forEach((lootbox) => {
      const lootboxItem = document.createElement("div");
      lootboxItem.className = "lootbox-card lootbox-item";
      lootboxItem.setAttribute("data-lootbox-id", lootbox.id);

      const hasAnimation = lootbox.animation;
      const imageOrAnimation = hasAnimation
        ? `<div class="lootbox-animation" data-animation-path="${lootbox.animation}" data-lootbox-id="${lootbox.id}"></div>`
        : `<img src="${lootbox.image || "/TGImage.svg"}" alt="Lootbox Image" class="lootbox-image" onerror="this.src='/default-icon.svg'; this.onerror=null;" />`;

      const backgroundStyle = lootbox.background ? `style="background-image: url('${lootbox.background}');"` : "";
      const ribbonText = lootbox.ribbonText || "GIFT";
      const buttonStyles = [];
      if (lootbox.buttonColor) buttonStyles.push(`background-color: ${lootbox.buttonColor}`);
      if (lootbox.buttonTextColor) buttonStyles.push(`color: ${lootbox.buttonTextColor}`);
      const buttonStyle = buttonStyles.length > 0 ? `style="${buttonStyles.join("; ")};"` : "";

      lootboxItem.innerHTML = `
        <div class="lootbox-content" ${backgroundStyle}>
          <span class="ribbon">${ribbonText}</span>
          ${imageOrAnimation}
          <div class="lootbox-info">
            <h3 class="lootbox-title">${lootbox.title || "Lootbox"}</h3>
            <p class="lootbox-description">${lootbox.description || "Contains rewards"}</p>
          </div>
          <button class="lootbox-button button-open" ${buttonStyle}>
            Open
            <div class="star-container">
              <span class="star-1"></span>
              <span class="star-2"></span>
              <span class="star-3"></span>
            </div>
          </button>
        </div>
      `;
      fragment.appendChild(lootboxItem);
    });
  } else {
    const noLootboxesItem = document.createElement("div");
    noLootboxesItem.textContent = "No lootboxes available.";
    fragment.appendChild(noLootboxesItem);
  }

  lootboxesList.innerHTML = "";
  lootboxesList.appendChild(fragment);

  document.querySelectorAll(".lootbox-animation").forEach((container) => {
    const animationPath = container.getAttribute("data-animation-path");
    const lootboxId = container.getAttribute("data-lootbox-id");
    if (animationPath && lootboxId) {
      initializeLottieForLootbox(container, animationPath).then((animation) => {
        if (animation) lootboxAnimations[lootboxId] = animation;
      });
    }
  });

  document.querySelectorAll(".lootbox-item .button-open").forEach((button) => {
    button.addEventListener("click", () => {
      const lootboxId = button.closest(".lootbox-item").getAttribute("data-lootbox-id");
      openPage(`lootbox-details-${lootboxId}`);
    });
  });
}

function initializeLottieForLootbox(container, path) {
  console.log(`Starting Lottie initialization for ${path} for user ${telegramUserId}`);
  return loadLottieJSON(path).then((data) => {
    if (!data || !container) {
      console.warn(`Failed to initialize Lottie for ${path} for user ${telegramUserId}: No data or container`);
      return null;
    }
    console.log(`Lottie data loaded for ${path}, frames: ${data.op} for user ${telegramUserId}`);

    const animation = lottie.loadAnimation({
      container,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData: data,
      rendererSettings: { preserveAspectRatio: "xMidYMid meet", clearCanvas: true },
    });

    animation.addEventListener("data_ready", () => console.log(`Data ready for ${path} for user ${telegramUserId}`));
    animation.addEventListener("DOMLoaded", () => console.log(`DOM loaded for ${path} for user ${telegramUserId}`));
    animation.addEventListener("complete", () => {
      console.log(`Animation completed for ${path} for user ${telegramUserId}`);
      animation.stop();
      animation.goToAndStop(data.op - 1, true);
    });
    animation.addEventListener("loopComplete", () => {
      console.log(`Loop completed for ${path} for user ${telegramUserId}`);
      animation.stop();
      animation.goToAndStop(data.op - 1, true);
    });
    animation.addEventListener("error", (error) => console.error(`Lottie error for ${path} for user ${telegramUserId}:`, error));

    setTimeout(() => {
      animation.stop();
      animation.goToAndStop(data.op - 1, true);
    }, 5000);

    return animation;
  }).catch((error) => {
    console.error(`Error initializing Lottie for ${path} for user ${telegramUserId}:`, error.message);
    return null;
  });
}

async function triggerHeartEarn() {
  if (!globalInitData) {
    console.warn("Cannot trigger heart earn: globalInitData is not set.");
    return;
  }

  try {
    const shakeResult = await fetchData("/api/v1/mini_tap", "POST", null, globalInitData);
    if (shakeResult && shakeResult.hearts !== undefined && shakeResult.energy !== undefined) {
      const data = await fetchData(`/api/v1/auth/login`, "POST", null, globalInitData);
      if (data && data.points) {
        updateUIDisplay(data);

        const heartsButton = document.getElementById("hearts-button");
        if (heartsButton) spawnHearts(heartsButton);
      }
    }
  } catch (error) {
    console.error("Shake failed:", error.message);
  }
}

// Функция для обработки встряхивания
function handleShake(speed) {
  const shakeThreshold = 15;
  if (speed > shakeThreshold) {
    // Воспроизводим тактильную обратную связь
    postTelegramEvent("web_app_trigger_haptic_feedback", {
      type: "impact",
      impact_style: "medium",
    });
    console.log("Haptic feedback triggered: medium");

    // Выполняем логику начисления сердечек
    triggerHeartEarn();
  }
}

// Функция для настройки Shake to Earn с использованием Telegram API
function setupShakeToEarn() {
  if (!telegramApp) {
    console.error("Telegram.WebApp not loaded. Shake to Earn will not work.");
    showNotification("Telegram.WebApp not loaded. Shake to Earn is unavailable.", "error");
    setupShakeToEarnFallback();
    return;
  }

  // Проверяем версию Telegram для поддержки акселерометра
  if (!telegramApp.isVersionAtLeast("8.0")) {
    console.warn("Telegram version does not support accelerometer API. Falling back to DeviceMotionEvent.");
    setupShakeToEarnFallback();
    return;
  }

  // Запускаем отслеживание акселерометра через Telegram API
  const started = postTelegramEvent("web_app_start_accelerometer", { refresh_rate: 100 });
  if (!started) {
    console.warn("Failed to start accelerometer via Telegram API. Falling back to DeviceMotionEvent.");
    setupShakeToEarnFallback();
  }
}

// Резервная функция для Shake to Earn с использованием DeviceMotionEvent
function setupShakeToEarnFallback() {
  const shakeThreshold = 15; // Порог ускорения для срабатывания
  let lastUpdate = 0;

  // Проверяем поддержку DeviceMotionEvent
  if (window.DeviceMotionEvent) {
    console.log("DeviceMotionEvent is supported.");

    // На iOS 13+ нужно запросить разрешение для доступа к акселерометру
    if (typeof DeviceMotionEvent.requestPermission === "function") {
      DeviceMotionEvent.requestPermission()
        .then((permissionState) => {
          if (permissionState === "granted") {
            console.log("DeviceMotionEvent permission granted.");
            startShakeDetection();
          } else {
            console.error("DeviceMotionEvent permission denied.");
            showNotification("Shake to Earn requires motion sensor access. Please allow access to continue.", "error");
          }
        })
        .catch((error) => {
          console.error("Failed to request DeviceMotionEvent permission:", error.message);
          showNotification("Failed to access motion sensors. Shake to Earn is unavailable.", "error");
        });
    } else {
      // На Android и других платформах, где разрешение не требуется
      startShakeDetection();
    }
  } else {
    console.error("DeviceMotionEvent is not supported on this device. Shake to Earn will not work.");
    showNotification("Shake to Earn is not supported on this device.", "error");
    return;
  }

  function startShakeDetection() {
    window.addEventListener("devicemotion", (event) => {
      const { x, y, z } = event.accelerationIncludingGravity || {};
      if (!x || !y || !z) return;

      const currentTime = Date.now();
      if (currentTime - lastUpdate < 100) return; // Ограничиваем частоту обработки
      lastUpdate = currentTime;

      const speed = Math.sqrt(x * x + y * y + z * z);
      console.log(`Accelerometer data: x=${x}, y=${y}, z=${z}, speed=${speed}`);

      if (speed > shakeThreshold) {
        // Воспроизводим тактильную обратную связь через Telegram.WebApp
        postTelegramEvent("web_app_trigger_haptic_feedback", {
          type: "impact",
          impact_style: "medium",
        });
        console.log("Haptic feedback triggered: medium");

        // Выполняем логику начисления сердечек
        triggerHeartEarn();
      }
    });
  }
}

function setupHeartsTap() {
  const heartsButton = document.getElementById("hearts-button");
  if (heartsButton) {
    heartsButton.addEventListener("click", async () => {
      // Воспроизводим тактильную обратную связь через Telegram.WebApp
      if (telegramApp) {
        postTelegramEvent("web_app_trigger_haptic_feedback", {
          type: "impact",
          impact_style: "light",
        });
        console.log("Haptic feedback triggered: light");
      }

      spawnHearts(heartsButton);
      if (!globalInitData) {
        console.warn("Cannot perform tap: globalInitData is not set.");
        return;
      }

      try {
        const tapResult = await fetchData("/api/v1/mini_tap", "POST", null, globalInitData);
        if (tapResult && tapResult.hearts !== undefined && tapResult.energy !== undefined) {
          const data = await fetchData(`/api/v1/auth/login`, "POST", null, globalInitData);
          if (data && data.points) {
            updateUIDisplay(data);
          }
        }
      } catch (error) {
        console.error("Tap failed:", error.message);
      }
    });
  }

  // Запускаем Shake to Earn
  setupShakeToEarn();
}

function setupClaim() {
  const claimButton = document.getElementById("claim-button");
  const checkInTimer = document.getElementById("check-in-timer");

  async function updateClaimUI() {
    if (!checkInTimer || !claimButton) return;

    if (!telegramUserId) {
      checkInTimer.textContent = "User ID not available";
      claimButton.classList.add("disabled");
      return;
    }

    if (!globalInitData) {
      checkInTimer.textContent = "Init data not available";
      claimButton.classList.add("disabled");
      return;
    }

    const claimData = await fetchData(`/api/v1/claim_daily_points/${telegramUserId}`, "GET", null, globalInitData);
    if (!claimData) {
      checkInTimer.textContent = "Failed to load status";
      claimButton.classList.add("disabled");
      return;
    }
    const now = Date.now();
    const nextClaimTime = claimData.nextClaimTimestamp ? new Date(claimData.nextClaimTimestamp).getTime() : null;
    if (nextClaimTime && now < nextClaimTime) {
      const secondsLeft = Math.floor((nextClaimTime - now) / 1000);
      checkInTimer.textContent = `Next claim in ${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m`;
      claimButton.classList.add("disabled");
    } else {
      checkInTimer.textContent = `Claim now! (${claimData.streak + 1}-day check-in)`;
      claimButton.classList.remove("disabled");
    }
  }

  if (claimButton) {
    claimButton.addEventListener("click", async () => {
      if (!claimButton.classList.contains("disabled")) {
        try {
          const claimResult = await fetchData(
            `/api/v1/claim_daily_points/${telegramUserId}`,
            "POST",
            null,
            globalInitData
          );
          if (claimResult && claimResult.tickets !== undefined) {
            const data = await fetchData(`/api/v1/auth/login`, "POST", null, globalInitData);
            updateUIDisplay(data);

            document.getElementById("checkmark-lottie").style.display = "block";
            setTimeout(() => document.getElementById("checkmark-lottie").style.display = "none", 2000);
            updateClaimUI();
          }
        } catch (error) {
          console.error("Claim failed:", error.message);
        }
      }
    });
    updateClaimUI();
    setInterval(updateClaimUI, 60000);
  }
}

function setupPartnerButtons() {
  document.querySelectorAll(".partner-action").forEach((button) => {
    button.addEventListener("click", () => {
      if (!button.disabled) {
        const partnerName = button.parentElement.querySelector(".partner-name").textContent;
      }
    });
  });
}

function setupRoulettePage() {
  document.querySelectorAll('[id^="lootbox-details-"]').forEach((lootboxPage) => {
    const buySpinsButton = lootboxPage.querySelector(".buy-spins-button");
    if (buySpinsButton) {
      buySpinsButton.addEventListener("click", () => {
        try {
          if (telegramApp) {
            telegramApp.showPopup({
              title: "Buy Spins",
              message: "To buy spins, you need to have LVL 10",
              buttons: [{ type: "ok", text: "OK" }],
            });
          } else {
            alert("To buy spins, you need to have LVL 10");
          }
        } catch (error) {
          console.error("Failed to open popup:", error.message);
          alert("To buy spins, you need to have LVL 10");
        }
      });
    }

    const rewardsListButton = lootboxPage.querySelector(".rewards-list-button");
    if (rewardsListButton) {
      rewardsListButton.addEventListener("click", () => {
        showNotification("To view the rewards list, you need to have LVL 10", "info");
      });
    }

    const stakeNFTButton = lootboxPage.querySelector(".stake-nft-button");
    if (stakeNFTButton) {
      stakeNFTButton.addEventListener("click", () => {});
    }

    const rewardItems = lootboxPage.querySelectorAll(".reward-item");
    rewardItems.forEach((item) => {
      const rewardAnimation = item.querySelector(".reward-animation");
      if (rewardAnimation) {
        item.addEventListener("click", () => {
          const id = item.getAttribute("data-id");
          const animation = rewardAnimations[id];
          if (animation) animation.goToAndPlay(0);
        });
      }
    });
  });
}

function setupHeaderSlider() {
  const slider = document.querySelector(".header-slides");
  const slides = document.querySelectorAll(".header-slide");
  const dots = document.querySelectorAll(".pagination-dot");

  if (!slider || slides.length === 0 || dots.length === 0) return;

  let currentIndex = Array.from(slides).findIndex((slide) => slide.classList.contains("active")) || 0;
  let startX = 0;
  let isDragging = false;

  function goToSlide(index) {
    slides[currentIndex].classList.remove("active");
    slides[currentIndex].classList.add("exit");
    dots[currentIndex].classList.remove("active");

    currentIndex = index;

    if (currentIndex < 0) currentIndex = slides.length - 1;
    if (currentIndex >= slides.length) currentIndex = 0;

    slides[currentIndex].classList.remove("exit");
    slides[currentIndex].classList.add("active");
    dots[currentIndex].classList.add("active");
  }

  goToSlide(currentIndex);

  slider.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
    isDragging = true;
  });

  slider.addEventListener("touchend", (e) => {
    if (!isDragging) return;
    const endX = e.changedTouches[0].clientX;
    const diffX = startX - endX;

    if (diffX > 50) goToSlide(currentIndex + 1);
    else if (diffX < -50) goToSlide(currentIndex - 1);

    isDragging = false;
  });

  setInterval(() => goToSlide(currentIndex + 1), 5000);
}

function setupHomePage() {
  setupHeaderSlider();
}

// Единый обработчик DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  // Отображаем отладочную информацию
  const versionElement = document.getElementById("telegram-version");
  const platformElement = document.getElementById("telegram-platform");
  const initDataElement = document.getElementById("telegram-init-data");

  if (versionElement && platformElement && initDataElement) {
    if (window.Telegram?.WebApp) {
      versionElement.textContent = window.Telegram.WebApp.version || "Unknown";
      platformElement.textContent = window.Telegram.WebApp.platform || "Unknown";
      initDataElement.textContent = JSON.stringify(window.Telegram.WebApp.initDataUnsafe || {}, null, 2);
    } else {
      versionElement.textContent = "Not loaded";
      platformElement.textContent = "Not loaded";
      initDataElement.textContent = "Telegram.WebApp not available";
    }
  }

  initializeLoadingAnimation();

  // Инициализируем Telegram и ждём завершения
  const isTelegramInitialized = await initTelegram();
  if (!isTelegramInitialized) {
    console.warn("Telegram initialization failed. Proceeding with limited functionality.");
    fetchUserData(""); // Вызываем в mock-режиме
  } else {
    fetchUserData(globalInitData);
  }

  const menuButtons = document.querySelectorAll(".menu button");
  menuButtons.forEach((button) => {
    button.addEventListener("click", () => openPage(button.dataset.page, false, globalInitData));
  });

  const connectWalletButton = document.getElementById("connect-wallet");
  if (connectWalletButton) {
    connectWalletButton.addEventListener("click", connectWallet);
    const savedWalletAddress = getState("walletAddress");
    if (savedWalletAddress) updateWalletDisplay(savedWalletAddress);
  }

  setupHeartsTap();
  setupClaim();

  const inviteButton = document.querySelector(".button-invite");
  if (inviteButton) {
    inviteButton.addEventListener("click", async () => {
      if (!telegramUserId) {
        showNotification("User ID not available. Please try again later.", "error");
        return;
      }
      if (!globalInitData) {
        showNotification("Init data not available. Please try again later.", "error");
        return;
      }
      const inviteLink = await fetchData(
        `/api/v1/referrals/invite-link?user_id=${telegramUserId}`,
        "GET",
        null,
        globalInitData
      );
      if (inviteLink && inviteLink.url) {
        try {
          if (telegramApp) {
            telegramApp.showPopup({
              title: "Invite a Friend",
              message: `Share this link with your friends:\n${inviteLink.url}`,
              buttons: [
                { id: "copy", type: "default", text: "Copy Link" },
                { type: "cancel", text: "Close" },
              ],
            }, (buttonId) => {
              if (buttonId === "copy") {
                navigator.clipboard.writeText(inviteLink.url).then(() => {
                  console.log("Invite link copied to clipboard");
                });
              }
            });
          }
        } catch (error) {
          console.error("Failed to open popup:", error.message);
        }
      }
    });
  }

  setupPartnerButtons();
  setupRoulettePage();
  setupHomePage();

  if (!lottieAnimationsLoaded.shakeTop) {
    const shakeTopLottie = document.getElementById("shake-top-lottie");
    if (shakeTopLottie && isElementVisible(shakeTopLottie)) {
      initializeLottie("shake-top-lottie", "/shake-top-animation.json", true, true).then(() => {
        lottieAnimationsLoaded.shakeTop = true;
      });
    }
  }

  const tryItOutButton = document.getElementById("try-it-out-button");
  if (tryItOutButton) {
    tryItOutButton.addEventListener("click", () => {
      try {
        if (telegramApp) {
          telegramApp.openTelegramLink("https://t.me/laboratorys_chat");
        } else {
          window.open("https://t.me/laboratorys_chat", "_blank");
        }
      } catch (error) {
        console.error("Failed to open Telegram link:", error.message);
        window.open("https://t.me/laboratorys_chat", "_blank");
      }
    });
  }

  const stickerStoreButton = document.getElementById("sticker-store-button");
  if (stickerStoreButton) {
    stickerStoreButton.addEventListener("click", () => {
      try {
        if (telegramApp) {
          telegramApp.openTelegramLink("https://t.me/sticker_bot/?startapp=cid_4");
        } else {
          window.open("https://t.me/sticker_bot/?startapp=cid_4", "_blank");
        }
      } catch (error) {
        console.error("Failed to open Telegram link:", error.message);
        window.open("https://t.me/sticker_bot/?startapp=cid_4", "_blank");
      }
    });
  }

  const memesTournamentButton = document.getElementById("memes-tournament-button");
  if (memesTournamentButton) {
    memesTournamentButton.addEventListener("click", () => {
      try {
        if (telegramApp) {
          telegramApp.openTelegramLink("https://t.me/laboratorys_chat");
        } else {
          window.open("https://t.me/laboratorys_chat", "_blank");
        }
      } catch (error) {
        console.error("Failed to open Telegram link:", error.message);
        window.open("https://t.me/laboratorys_chat", "_blank");
      }
    });
  }

  const savedPage = getState("activePage") || "home";
  openPage(savedPage, true, globalInitData);
  if (globalInitData && telegramUserId) {
    updateReferralCount(globalInitData);
  }
});