"use strict";

const TEST_FILES = [
  "tests/english.json",
  "tests/readiness_test(1).json",
  "tests/databases(6).json",
  "tests/algorithms(4).json",
];

const FALLBACK_TESTS = {
  "tests/english.json": {
    title: "English Test",
    time: 10,
    shuffleQuestions: false,
    shuffleAnswers: false,
    questions: [
      {
        question: "Money can't buy you ____ happiness.",
        answers: ["the", "some", "any", "-"],
        correct: 3,
      },
      {
        question: "I have never ____ to Japan.",
        answers: ["been", "go", "went", "be"],
        correct: 0,
      },
      {
        question: "Choose the correct sentence.",
        answers: [
          "She don't like coffee.",
          "She doesn't likes coffee.",
          "She doesn't like coffee.",
          "She not like coffee.",
        ],
        correct: 2,
      },
      {
        question: "Which word is a synonym for 'happy' ?",
        answers: ["Sad", "Joyful", "Angry", "Tired"],
        correct: 1,
      },
    ],
  },
  "tests/general-knowledge.json": {
    title: "General Knowledge",
    time: 8,
    shuffleQuestions: true,
    shuffleAnswers: true,
    questions: [
      {
        question: "Which planet is known as the Red Planet?",
        answers: ["Venus", "Mars", "Jupiter", "Mercury"],
        correct: 1,
      },
      {
        question: "What is the capital of France?",
        answers: ["Rome", "Berlin", "Paris", "Madrid"],
        correct: 2,
      },
      {
        question: "Which gas do humans need to breathe?",
        answers: ["Oxygen", "Hydrogen", "Carbon dioxide", "Helium"],
        correct: 0,
      },
      {
        question: "How many days are in a leap year?",
        answers: ["364", "365", "366", "367"],
        correct: 2,
      },
    ],
  },
};

const state = {
  tests: [],
  activeTestId: null,
  activeTest: null,
  pendingTestId: null,
  questions: [],
  currentQuestionIndex: 0,
  selectedAnswers: [],
  timeRemaining: 0,
  totalTime: 0,
  timerId: null,
  errors: [],
  currentTheme: localStorage.getItem("quiz-theme") || "light",
};

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  applyTheme(state.currentTheme);
  loadTests();
});

function bindEvents() {
  const themeToggle = document.getElementById("themeToggle");
  themeToggle.addEventListener("click", toggleTheme);

  document.getElementById("testList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-test-id]");
    if (!button) return;
    const testId = button.dataset.testId;
    startTest(testId);
  });

  document.getElementById("answers").addEventListener("click", (event) => {
    const option = event.target.closest(".answer-option");
    if (!option) return;

    const selectedIndex = Number(option.dataset.index);
    if (!Number.isInteger(selectedIndex)) return;

    const currentQuestion = state.questions[state.currentQuestionIndex];
    if (!currentQuestion) return;

    const currentSelection = normalizeSelectedIndexes(
      state.selectedAnswers[state.currentQuestionIndex],
      currentQuestion.answers.length,
      Boolean(currentQuestion.multipleAnswers)
    );

    if (Boolean(currentQuestion.multipleAnswers)) {
      const nextSelection = currentSelection.includes(selectedIndex)
        ? currentSelection.filter((index) => index !== selectedIndex)
        : [...currentSelection, selectedIndex];

      state.selectedAnswers[state.currentQuestionIndex] = nextSelection;
    } else {
      state.selectedAnswers[state.currentQuestionIndex] = selectedIndex;
    }

    saveProgress();
    renderQuestion();
  });

  document.getElementById("nextBtn").addEventListener("click", () => {
    if (state.currentQuestionIndex < state.questions.length - 1) {
      state.currentQuestionIndex += 1;
      saveProgress();
      renderQuestion();
    }
  });

  document.getElementById("backBtn").addEventListener("click", () => {
    if (state.currentQuestionIndex > 0) {
      state.currentQuestionIndex -= 1;
      saveProgress();
      renderQuestion();
    }
  });

  document.getElementById("finishBtn").addEventListener("click", finishTest);
  document.getElementById("retryBtn").addEventListener("click", () => {
    if (state.activeTestId) {
      startTest(state.activeTestId, true);
    }
  });

  document.getElementById("menuBtn").addEventListener("click", () => {
    stopTimer();
    localStorage.removeItem("quiz-progress");
    hideSettingsModal();
    showScreen("menu");
    resetResultState();
    state.activeTestId = null;
    state.activeTest = null;
    state.pendingTestId = null;
    state.questions = [];
    state.currentQuestionIndex = 0;
    state.selectedAnswers = [];
  });

  document.getElementById("showErrorsBtn").addEventListener("click", toggleErrors);
  document.getElementById("resumeBtn").addEventListener("click", resumeSavedTest);
  document.getElementById("discardBtn").addEventListener("click", () => {
    localStorage.removeItem("quiz-progress");
    hideResumeModal();
  });

  document.querySelectorAll('input[name="questionMode"]').forEach((radio) => {
    radio.addEventListener("change", syncQuestionModeUI);
  });

  document.getElementById("customQuestionCount").addEventListener("input", (event) => {
    const input = event.target;
    const maxQuestions = getCurrentSettingsMaxQuestions();
    let value = Number(input.value) || 0;

    if (value < 1) {
      value = 1;
    }

    if (value > maxQuestions) {
      value = maxQuestions;
    }

    input.value = value;
  });

  document.getElementById("startTestBtn").addEventListener("click", startConfiguredTest);
}

async function loadTests() {
  const collectedTests = [];

  for (const file of TEST_FILES) {
    const rawData = await loadSingleTest(file);
    if (!rawData) continue;

    collectedTests.push({
      id: file,
      title: rawData.title || file,
      time: Number(rawData.time) || 0,
      shuffleQuestions: Boolean(rawData.shuffleQuestions),
      shuffleAnswers: Boolean(rawData.shuffleAnswers),
      multipleAnswers: Boolean(rawData.multipleAnswers),
      questions: Array.isArray(rawData.questions) ? rawData.questions : [],
    });
  }

  state.tests = collectedTests;
  renderTestCards();
  maybeOfferResume();
}

async function loadSingleTest(filePath) {
  try {
    const response = await fetch(filePath);
    if (!response.ok) {
      throw new Error("JSON not found");
    }

    return await response.json();
  } catch (error) {
    return FALLBACK_TESTS[filePath] || null;
  }
}

function renderTestCards() {
  const list = document.getElementById("testList");
  if (!state.tests.length) {
    list.innerHTML = "<p>Тесты не найдены.</p>";
    return;
  }

  list.innerHTML = state.tests
    .map(
      (test) => `
        <article class="test-card">
          <h3>${escapeHtml(test.title)}</h3>
          <div class="test-meta">
            <span>❓ ${test.questions.length} вопросов</span>
            <span>⏱ ${formatTimeMinutes(test.time)}</span>
          </div>
          <button class="btn btn-primary" type="button" data-test-id="${escapeHtml(test.id)}">Начать</button>
        </article>
      `
    )
    .join("");
}

function startTest(testId, forceFresh = false) {
  const selectedTest = state.tests.find((test) => test.id === testId);
  if (!selectedTest) return;

  if (!forceFresh) {
    const savedProgress = readSavedProgress();
    if (savedProgress && savedProgress.testId === testId) {
      showResumeModal(selectedTest.title);
      return;
    }
  }

  hideResumeModal();
  state.pendingTestId = testId;
  openSettingsModal(selectedTest);
}

function openSettingsModal(test) {
  const totalQuestions = Array.isArray(test.questions) ? test.questions.length : 0;
  const customInput = document.getElementById("customQuestionCount");

  document.getElementById("settingsTestTitle").textContent = test.title;
  document.getElementById("settingsTotalQuestions").textContent = String(totalQuestions);
  customInput.value = String(totalQuestions);
  customInput.max = String(totalQuestions);
  customInput.disabled = true;

  const allRadio = document.querySelector('input[name="questionMode"][value="all"]');
  const customRadio = document.querySelector('input[name="questionMode"][value="custom"]');

  allRadio.checked = true;
  customRadio.checked = false;

  document.getElementById("settingsModal").classList.remove("hidden");
  document.getElementById("settingsModal").setAttribute("aria-hidden", "false");
}

function hideSettingsModal() {
  document.getElementById("settingsModal").classList.add("hidden");
  document.getElementById("settingsModal").setAttribute("aria-hidden", "true");
}

function syncQuestionModeUI() {
  const allRadio = document.querySelector('input[name="questionMode"][value="all"]');
  const customInput = document.getElementById("customQuestionCount");
  const maxQuestions = getCurrentSettingsMaxQuestions();

  if (allRadio.checked) {
    customInput.disabled = true;
    customInput.value = String(maxQuestions);
    return;
  }

  customInput.disabled = false;
  customInput.value = String(Math.min(Number(customInput.value) || maxQuestions, maxQuestions));
  customInput.focus();
}

function getCurrentSettingsMaxQuestions() {
  const selectedTest = state.tests.find((test) => test.id === state.pendingTestId);
  return selectedTest && Array.isArray(selectedTest.questions) ? selectedTest.questions.length : 0;
}

function startConfiguredTest() {
  const testId = state.pendingTestId;
  const selectedTest = state.tests.find((test) => test.id === testId);

  if (!selectedTest) return;

  const allRadio = document.querySelector('input[name="questionMode"][value="all"]');
  const maxQuestions = selectedTest.questions.length;
  let selectedCount = maxQuestions;

  if (!allRadio.checked) {
    const customValue = Number(document.getElementById("customQuestionCount").value) || 0;
    selectedCount = clamp(customValue, 1, maxQuestions);
  }

  hideSettingsModal();
  launchTest(selectedTest, selectedCount);
}

function launchTest(test, selectedCount) {
  const maxQuestions = Array.isArray(test.questions) ? test.questions.length : 0;
  const safeCount = clamp(Number(selectedCount) || maxQuestions, 1, maxQuestions);

  state.activeTestId = test.id;
  state.activeTest = test;
  state.questions = buildQuestionSet(test, safeCount);
  state.currentQuestionIndex = 0;
  state.selectedAnswers = Array(state.questions.length).fill(null);
  state.errors = [];
  state.totalTime = convertTimeToSeconds(test.time);
  state.timeRemaining = state.totalTime;

  showScreen("quiz");
  renderQuestion();
  saveProgress();
  startTimer();
}

function resumeSavedTest() {
  const savedProgress = readSavedProgress();
  if (!savedProgress) return;

  const selectedTest = state.tests.find((test) => test.id === savedProgress.testId);
  if (!selectedTest) {
    localStorage.removeItem("quiz-progress");
    hideResumeModal();
    return;
  }

  hideResumeModal();
  state.activeTestId = selectedTest.id;
  state.activeTest = selectedTest;

  const selectedLimit = clamp(
    Number(savedProgress.questionCount) || selectedTest.questions.length,
    1,
    selectedTest.questions.length
  );

  state.questions = buildQuestionSet(selectedTest, selectedLimit);
  state.currentQuestionIndex = clamp(
    Number(savedProgress.currentQuestionIndex) || 0,
    0,
    Math.max(state.questions.length - 1, 0)
  );

  state.selectedAnswers = Array.isArray(savedProgress.selectedAnswers)
    ? savedProgress.selectedAnswers.slice(0, state.questions.length)
    : Array(state.questions.length).fill(null);

  while (state.selectedAnswers.length < state.questions.length) {
    state.selectedAnswers.push(null);
  }

  state.totalTime = convertTimeToSeconds(selectedTest.time);
  state.timeRemaining = Number(savedProgress.timeRemaining) || state.totalTime;
  state.timeRemaining = clamp(state.timeRemaining, 0, state.totalTime);
  state.errors = [];

  showScreen("quiz");
  renderQuestion();
  startTimer();
}

function buildQuestionSet(test, questionLimit = test.questions.length) {
  const preparedQuestions = test.questions.map((question) =>
    normalizeQuestion(question, test.shuffleAnswers, Boolean(test.multipleAnswers) || Boolean(question.multipleAnswers))
  );
  const maxAllowed = Math.min(Math.max(Number(questionLimit) || preparedQuestions.length, 1), preparedQuestions.length);

  if (test.shuffleQuestions) {
    shuffleArray(preparedQuestions);
  }

  return preparedQuestions.slice(0, maxAllowed);
}

function normalizeQuestion(question, shuffleAnswers, multipleAnswersMode = false) {
  const safeAnswers = Array.isArray(question.answers) ? question.answers.slice() : [];
  const isMultipleAnswer = Boolean(multipleAnswersMode) || Boolean(question.multipleAnswers) || Array.isArray(question.correct);
  const safeCorrect = normalizeCorrectIndexes(question.correct, safeAnswers.length, isMultipleAnswer);

  if (!shuffleAnswers || safeAnswers.length <= 1) {
    return {
      question: question.question || "",
      answers: safeAnswers,
      correct: isMultipleAnswer ? safeCorrect : safeCorrect[0] ?? 0,
      multipleAnswers: isMultipleAnswer,
    };
  }

  const answerEntries = safeAnswers.map((answer, index) => ({ answer, index }));
  shuffleArray(answerEntries);

  const remappedCorrect = isMultipleAnswer
    ? safeCorrect.map((index) => {
        const found = answerEntries.findIndex((entry) => entry.index === index);
        return found >= 0 ? found : index;
      })
    : (() => {
        const correctIndex = answerEntries.findIndex((entry) => entry.index === safeCorrect[0]);
        return correctIndex >= 0 ? correctIndex : 0;
      })();

  return {
    question: question.question || "",
    answers: answerEntries.map((entry) => entry.answer),
    correct: remappedCorrect,
    multipleAnswers: isMultipleAnswer,
  };
}

function renderQuestion() {
  if (!state.activeTest || !state.questions.length) {
    showScreen("menu");
    return;
  }

  const currentQuestion = state.questions[state.currentQuestionIndex];
  if (!currentQuestion) return;

  const totalQuestions = state.questions.length;
  const currentNumber = state.currentQuestionIndex + 1;
  const selectedIndexes = normalizeSelectedIndexes(
    state.selectedAnswers[state.currentQuestionIndex],
    currentQuestion.answers.length,
    Boolean(currentQuestion.multipleAnswers)
  );

  document.getElementById("questionCounter").textContent = `${currentNumber} / ${totalQuestions}`;
  document.getElementById("questionText").textContent = currentQuestion.question;
  document.getElementById("progressBar").style.width = `${(currentNumber / totalQuestions) * 100}%`;
  document.getElementById("timer").textContent = formatTime(state.timeRemaining);

  const answerContainer = document.getElementById("answers");
  answerContainer.innerHTML = currentQuestion.answers
    .map((answer, index) => {
      const isSelected = selectedIndexes.includes(index);
      return `
        <button class="answer-option ${isSelected ? "selected" : ""}" type="button" data-index="${index}">
          <span class="answer-letter">${String.fromCharCode(65 + index)}</span>
          <span class="answer-text">${escapeHtml(answer)}</span>
        </button>
      `;
    })
    .join("");

  const isFirstQuestion = state.currentQuestionIndex === 0;
  const isLastQuestion = state.currentQuestionIndex === totalQuestions - 1;

  document.getElementById("backBtn").disabled = isFirstQuestion;
  document.getElementById("nextBtn").classList.toggle("hidden", isLastQuestion);
  document.getElementById("finishBtn").classList.toggle("hidden", !isLastQuestion);

  saveProgress();
}

function startTimer() {
  stopTimer();

  state.timerId = setInterval(() => {
    if (!state.activeTestId) return;

    state.timeRemaining = Math.max(0, state.timeRemaining - 1);
    document.getElementById("timer").textContent = formatTime(state.timeRemaining);
    saveProgress();

    if (state.timeRemaining <= 0) {
      finishTest();
    }
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function finishTest() {
  stopTimer();

  if (!state.activeTest || !state.questions.length) {
    return;
  }

  let correctCount = 0;
  let wrongCount = 0;
  const errors = [];

  state.questions.forEach((question, index) => {
    const selected = normalizeSelectedIndexes(
      state.selectedAnswers[index],
      question.answers.length,
      Boolean(question.multipleAnswers)
    );
    const expected = normalizeCorrectIndexes(question.correct, question.answers.length, Boolean(question.multipleAnswers));
    const isCorrect = selectedAnswerMatchesExpected(selected, expected, Boolean(question.multipleAnswers));

    if (isCorrect) {
      correctCount += 1;
      return;
    }

    wrongCount += 1;
    errors.push({
      question: question.question,
      userAnswer: selected.length ? selected.map((answerIndex) => question.answers[answerIndex]).join(", ") : "Нет ответа",
      correctAnswer: expected.length ? expected.map((answerIndex) => question.answers[answerIndex]).join(", ") : "Нет правильного ответа",
    });
  });

  const total = state.questions.length || 1;
  const percent = Math.round((correctCount / total) * 100);
  const gradeSummary = getGradeResult(percent);

  state.errors = errors;
  localStorage.removeItem("quiz-progress");

  document.getElementById("correctCount").textContent = String(correctCount);
  document.getElementById("wrongCount").textContent = String(wrongCount);
  document.getElementById("percentValue").textContent = `${percent}%`;
  document.getElementById("gradeValue").textContent = gradeSummary.label;
  document.getElementById("resultGrade").textContent = `Результат: ${gradeSummary.label} — ${gradeSummary.message}`;

  const errorsBlock = document.getElementById("errorsBlock");
  errorsBlock.classList.add("hidden");
  errorsBlock.innerHTML = "";
  document.getElementById("showErrorsBtn").textContent = "Посмотреть ошибки";

  showScreen("result");
}

function toggleErrors() {
  const errorsBlock = document.getElementById("errorsBlock");
  const showButton = document.getElementById("showErrorsBtn");

  if (errorsBlock.classList.contains("hidden")) {
    if (!state.errors.length) {
      errorsBlock.innerHTML = "<p>Ошибок не найдено.</p>";
    } else {
      errorsBlock.innerHTML = `
        <h4>Ошибки</h4>
        ${state.errors
          .map(
            (error, index) => `
              <div class="error-item">
                <p><strong>${index + 1}.</strong> ${escapeHtml(error.question)}</p>
                <p>Ваш ответ: ${escapeHtml(error.userAnswer)}</p>
                <p>Правильный ответ: ${escapeHtml(error.correctAnswer)}</p>
              </div>
            `
          )
          .join("")}
      `;
    }

    errorsBlock.classList.remove("hidden");
    showButton.textContent = "Скрыть ошибки";
    return;
  }

  errorsBlock.classList.add("hidden");
  showButton.textContent = "Посмотреть ошибки";
}

function resetResultState() {
  document.getElementById("errorsBlock").classList.add("hidden");
  document.getElementById("errorsBlock").innerHTML = "";
  document.getElementById("showErrorsBtn").textContent = "Посмотреть ошибки";
}

function showScreen(screenName) {
  document.querySelectorAll(".screen").forEach((screen) => {
    screen.classList.toggle("active", screen.id === `${screenName}Screen`);
  });
}

function toggleTheme() {
  state.currentTheme = state.currentTheme === "light" ? "dark" : "light";
  localStorage.setItem("quiz-theme", state.currentTheme);
  applyTheme(state.currentTheme);
}

function applyTheme(theme) {
  document.body.classList.toggle("theme-dark", theme === "dark");
  document.body.classList.toggle("theme-light", theme === "light");

  const themeToggle = document.getElementById("themeToggle");
  themeToggle.innerHTML = theme === "dark" ? "<span class=\"toggle-icon\">☀️</span>" : "<span class=\"toggle-icon\">🌙</span>";
}

function showResumeModal(title) {
  document.getElementById("resumeTitle").textContent = `У вас есть незавершённый тест: ${title}`;
  document.getElementById("resumeModal").classList.remove("hidden");
  document.getElementById("resumeModal").setAttribute("aria-hidden", "false");
}

function hideResumeModal() {
  document.getElementById("resumeModal").classList.add("hidden");
  document.getElementById("resumeModal").setAttribute("aria-hidden", "true");
}

function saveProgress() {
  if (!state.activeTestId) return;

  const payload = {
    testId: state.activeTestId,
    questionCount: state.questions.length,
    currentQuestionIndex: state.currentQuestionIndex,
    selectedAnswers: state.selectedAnswers,
    timeRemaining: state.timeRemaining,
  };

  localStorage.setItem("quiz-progress", JSON.stringify(payload));
}

function readSavedProgress() {
  try {
    const raw = localStorage.getItem("quiz-progress");
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function maybeOfferResume() {
  const savedProgress = readSavedProgress();
  if (!savedProgress || !savedProgress.testId) return;

  const savedTest = state.tests.find((test) => test.id === savedProgress.testId);
  if (!savedTest) return;

  showResumeModal(savedTest.title);
}

function convertTimeToSeconds(timeValue) {
  const safeValue = Number(timeValue) || 0;
  return safeValue > 0 ? safeValue * 60 : 0;
}

function formatTimeMinutes(timeValue) {
  const minutes = Number(timeValue) || 0;
  return `${minutes} мин`;
}

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function shuffleArray(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getGradeResult(percent) {
  if (percent >= 90) {
    return { label: "A", message: "Отлично" };
  }
  if (percent >= 75) {
    return { label: "B", message: "Хорошо" };
  }
  if (percent >= 60) {
    return { label: "C", message: "Удовлетворительно" };
  }
  if (percent >= 40) {
    return { label: "D", message: "Нужно повторить" };
  }
  return { label: "F", message: "Плохо" };
}

function normalizeSelectedIndexes(value, answerCount, multipleAnswers = false) {
  const safeAnswerCount = Math.max(0, Number(answerCount) || 0);

  if (multipleAnswers) {
    if (!Array.isArray(value)) {
      return Number.isInteger(value) ? [clamp(Number(value), 0, Math.max(safeAnswerCount - 1, 0))] : [];
    }

    const normalizedValues = value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item < safeAnswerCount);

    return [...new Set(normalizedValues)].sort((a, b) => a - b);
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];
    const normalizedValue = Number(firstValue);
    return Number.isInteger(normalizedValue) && normalizedValue >= 0 && normalizedValue < safeAnswerCount
      ? [normalizedValue]
      : [];
  }

  const normalizedValue = Number(value);
  return Number.isInteger(normalizedValue) && normalizedValue >= 0 && normalizedValue < safeAnswerCount
    ? [normalizedValue]
    : [];
}

function normalizeCorrectIndexes(value, answerCount, multipleAnswers = false) {
  const safeAnswerCount = Math.max(0, Number(answerCount) || 0);

  if (multipleAnswers) {
    const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
    const normalizedValues = values
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0 && item < safeAnswerCount);

    return [...new Set(normalizedValues)].sort((a, b) => a - b);
  }

  const normalizedValue = Number(value);
  return Number.isInteger(normalizedValue) && normalizedValue >= 0 && normalizedValue < safeAnswerCount
    ? [normalizedValue]
    : [0];
}

function selectedAnswerMatchesExpected(selected, expected, multipleAnswers = false) {
  if (!multipleAnswers) {
    return selected.length > 0 && expected.length > 0 && selected[0] === expected[0];
  }

  return selected.length === expected.length && selected.every((item, index) => item === expected[index]);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
