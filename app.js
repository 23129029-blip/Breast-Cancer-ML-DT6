
"use strict";

// ==========================================
// BREASTCARE AI - FRONTEND JAVASCRIPT
// ==========================================

const API_BASE = "";

let classChart = null;
let modelChart = null;

// Mẫu tiếp theo, dùng chỉ số bắt đầu từ 0
let nextSampleIndex = 0;

// Ngăn tải trùng mẫu do nhấn nhiều lần
let sampleLoading = false;

// ==========================================
// 1. HÀM TIỆN ÍCH
// ==========================================

function setText(id, value) {
    const element = document.getElementById(id);

    if (element && value !== undefined && value !== null) {
        element.textContent = value;
    }
}

function showMessage(element, message, type = "info") {
    if (!element) return;

    element.textContent = message;
    element.className = "message message-" + type;
    element.style.display = "block";
}

function hideMessage(element) {
    if (!element) return;

    element.textContent = "";
    element.style.display = "none";
}

function showResultBox(box) {
    if (!box) return;

    box.classList.remove("hidden");
    box.classList.add("show");
}

function hideResultBox(box) {
    if (!box) return;

    box.replaceChildren();
    box.classList.remove("show");
    box.classList.add("hidden");
}

function showResultMessage(box, message, type = "info") {
    if (!box) return;

    box.replaceChildren();

    const paragraph = document.createElement("p");
    paragraph.className = "result-detail";
    paragraph.textContent = message;

    box.appendChild(paragraph);
    showResultBox(box);

    if (type === "error") {
        console.error(message);
    }
}

// ==========================================
// 2. KẾT NỐI BACKEND PYTHON
// ==========================================

async function apiRequest(endpoint, options = {}) {
    let response;

    try {
        response = await fetch(API_BASE + endpoint, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            }
        });
    } catch (error) {
        throw new Error(
            "Không kết nối được backend. " +
            "Hãy kiểm tra máy chủ FastAPI tại " +
            API_BASE
        );
    }

    let data;

    try {
        data = await response.json();
    } catch (error) {
        throw new Error(
            "Backend không trả về dữ liệu JSON hợp lệ."
        );
    }

    if (!response.ok) {
        const detail = data.detail || data.message;

        const message =
            typeof detail === "string"
                ? detail
                : detail
                    ? JSON.stringify(detail)
                    : "Yêu cầu thất bại. Mã HTTP: " +
                      response.status;

        throw new Error(message);
    }

    return data;
}

// ==========================================
// 3. CHUYỂN TRANG
// ==========================================

function initNavigation() {
    const navLinks = document.querySelectorAll(".nav-item");
    const pages = document.querySelectorAll(".page");

    navLinks.forEach(function (link) {
        link.addEventListener("click", function () {
            const target = link.dataset.page;

            navLinks.forEach(function (item) {
                item.classList.remove("active");
            });

            pages.forEach(function (page) {
                page.classList.remove("active");
            });

            link.classList.add("active");

            const targetPage = document.getElementById(target);

            if (targetPage) {
                targetPage.classList.add("active");
            }

            const titles = {
                overview: "Tổng quan hệ thống",
                prediction: "Dự đoán",
                evaluation: "Đánh giá mô hình"
            };

            setText(
                "page-title",
                titles[target] || "BreastCare AI"
            );

            if (target === "evaluation") {
                loadEvaluation();
            }
        });
    });
}

// ==========================================
// 4. TRANG TỔNG QUAN
// ==========================================

async function loadOverview() {
    try {
        const data = await apiRequest("/api/overview");

        setText("total-samples", data.total_samples);
        setText("total-features", data.total_features);
        setText("malignant-count", data.malignant_count);
        setText("benign-count", data.benign_count);

        let distribution = null;

        if (
            data.class_distribution &&
            typeof data.class_distribution === "object"
        ) {
            distribution = data.class_distribution;
        } else if (
            Array.isArray(data.class_names) &&
            Array.isArray(data.class_counts)
        ) {
            distribution = {};

            data.class_names.forEach(function (name, index) {
                distribution[name] = data.class_counts[index];
            });
        }

        if (distribution) {
            renderClassChart(distribution);
        }

    } catch (error) {
        console.error(
            "Lỗi tải trang tổng quan:",
            error.message
        );
    }
}

// ==========================================
// 5. BIỂU ĐỒ PHÂN BỐ LỚP
// ==========================================

function renderClassChart(distribution) {
    const canvas = document.getElementById("class-chart");

    if (!canvas || typeof Chart === "undefined") {
        return;
    }

    if (classChart) {
        classChart.destroy();
        classChart = null;
    }

    classChart = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: Object.keys(distribution),
            datasets: [{
                data: Object.values(distribution),
                backgroundColor: ["#13a89e", "#245b80"],
                borderWidth: 3,
                borderColor: "#ffffff",
                hoverOffset: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%",
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        usePointStyle: true,
                        padding: 18
                    }
                }
            }
        }
    });
}

// ==========================================
// 6. TẠO 30 Ô NHẬP ĐẶC TRƯNG
// ==========================================

async function initFeatureInputs() {
    const container = document.getElementById("feature-form");

    if (!container) {
        console.error("Không tìm thấy vùng feature-form.");
        return false;
    }

    try {
        const data = await apiRequest("/api/sample");

        if (!data || !data.features) {
            throw new Error(
                "API không trả về danh sách đặc trưng."
            );
        }

        const featureNames = Object.keys(data.features);

        if (featureNames.length !== 30) {
            throw new Error(
                "API trả về " + featureNames.length +
                " đặc trưng thay vì 30."
            );
        }

        container.replaceChildren();

        featureNames.forEach(function (name) {
            const label = document.createElement("label");
            label.className = "feature-field";

            const caption = document.createElement("span");
            caption.textContent = name;

            const input = document.createElement("input");
            input.type = "number";
            input.name = name;
            input.step = "any";
            input.required = true;
            input.placeholder = "Nhập giá trị";

            label.appendChild(caption);
            label.appendChild(input);

            container.appendChild(label);
        });

        console.log("Đã tạo thành công 30 ô nhập liệu.");
        return true;

    } catch (error) {
        container.replaceChildren();

        const message = document.createElement("p");
        message.textContent =
            "Không thể tạo ô nhập liệu: " + error.message;

        container.appendChild(message);

        console.error("Lỗi tạo ô nhập liệu:", error);
        return false;
    }
}

// ==========================================
// 7. HIỂN THỊ THÔNG TIN MẪU
// ==========================================

function displaySampleInfo(data) {
    let info = document.getElementById("sample-info");

    if (!info) {
        info = document.createElement("p");
        info.id = "sample-info";
        info.className = "sample-info";

        const actions = document.querySelector(".form-actions");

        if (actions) {
            actions.insertAdjacentElement("afterend", info);
        }
    }

    if (!info) return;

    const sampleIndex = data.sample_index;
    const totalSamples = data.total_samples;
    const diagnosis = data.true_diagnosis;

    info.textContent =
        "Mẫu " + sampleIndex + "/" + totalSamples +
        (
            diagnosis
                ? " | Nhãn thực tế trong dữ liệu: " + diagnosis
                : ""
        );
}

// ==========================================
// 8. TẢI MẪU THEO SỐ THỨ TỰ
// ==========================================

async function loadSampleByIndex(index) {
    if (sampleLoading) return;

    if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= 569
    ) {
        throw new Error(
            "Chỉ số mẫu phải nằm trong khoảng 0 đến 568."
        );
    }

    sampleLoading = true;

    const selectButton =
        document.getElementById("select-sample-btn");

    const nextButton =
        document.getElementById("sample-btn");

    const indexInput =
        document.getElementById("sample-index-input");

    const originalSelectText =
        selectButton ? selectButton.textContent : "";

    const originalNextText =
        nextButton ? nextButton.textContent : "";

    if (selectButton) {
        selectButton.disabled = true;
        selectButton.textContent = "Đang tải...";
    }

    if (nextButton) {
        nextButton.disabled = true;
        nextButton.textContent = "Đang tải...";
    }

    try {
        // Giao diện đánh số từ 1; API nhận index từ 0.
        const data = await apiRequest(
            "/api/sample?index=" + index
        );

        if (
            !data ||
            !data.features ||
            !Number.isInteger(Number(data.sample_index)) ||
            !Number.isInteger(Number(data.total_samples))
        ) {
            throw new Error(
                "Dữ liệu mẫu trả về không đúng định dạng. " +
                "Hãy kiểm tra api.py."
            );
        }

        const container =
            document.getElementById("feature-form");

        if (!container) {
            throw new Error("Không tìm thấy vùng nhập liệu.");
        }

        const inputs = new Map();

        container.querySelectorAll("input[name]").forEach(
            function (input) {
                inputs.set(input.name, input);
            }
        );

        let filledCount = 0;

        Object.entries(data.features).forEach(
            function ([name, value]) {
                const input = inputs.get(name);

                if (input) {
                    input.value = String(value);

                    input.dispatchEvent(
                        new Event("input", { bubbles: true })
                    );

                    input.dispatchEvent(
                        new Event("change", { bubbles: true })
                    );

                    filledCount++;
                }
            }
        );

        if (filledCount !== 30) {
            throw new Error(
                "Chỉ điền được " + filledCount +
                "/30 đặc trưng. Hãy tải lại trang."
            );
        }

        const sampleNumber = Number(data.sample_index);
        const totalSamples = Number(data.total_samples);

        // Sau khi tải mẫu đã chọn, cập nhật mẫu kế tiếp.
        nextSampleIndex = sampleNumber % totalSamples;

        if (indexInput) {
            indexInput.value = String(sampleNumber);
        }

        displaySampleInfo(data);

        // Xóa kết quả cũ để tránh nhầm giữa các mẫu.
        hideResultBox(
            document.getElementById("prediction-result")
        );

        console.log(
            "Đã tải mẫu " + sampleNumber +
            "/" + totalSamples
        );

        return data;

    } finally {
        sampleLoading = false;

        if (selectButton) {
            selectButton.disabled = false;
            selectButton.textContent = originalSelectText;
        }

        if (nextButton) {
            nextButton.disabled = false;
            nextButton.textContent = originalNextText;
        }
    }
}

// ==========================================
// 9. CHỌN MẪU HOẶC TẢI MẪU TIẾP THEO
// ==========================================

function initSampleButton() {
    const selectButton =
        document.getElementById("select-sample-btn");

    const nextButton =
        document.getElementById("sample-btn");

    const indexInput =
        document.getElementById("sample-index-input");

    // --------------------------------------
    // 9.1. TẢI MẪU DO NGƯỜI DÙNG CHỌN
    // --------------------------------------

    if (selectButton && indexInput) {
        selectButton.addEventListener(
            "click",
            async function () {
                const selectedNumber =
                    Number(indexInput.value);

                if (
                    indexInput.value.trim() === "" ||
                    !Number.isInteger(selectedNumber) ||
                    selectedNumber < 1 ||
                    selectedNumber > 569
                ) {
                    alert(
                        "Vui lòng chọn số mẫu nguyên từ 1 đến 569."
                    );

                    indexInput.focus();
                    return;
                }

                try {
                    await loadSampleByIndex(selectedNumber - 1);

                } catch (error) {
                    alert(
                        "Không thể tải mẫu đã chọn: " +
                        error.message
                    );

                    console.error(
                        "Lỗi tải mẫu đã chọn:",
                        error
                    );
                }
            }
        );

        // Cho phép nhấn Enter sau khi nhập số mẫu.
        indexInput.addEventListener("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                selectButton.click();
            }
        });
    }

    // --------------------------------------
    // 9.2. TẢI MẪU TIẾP THEO
    // --------------------------------------

    if (nextButton) {
        nextButton.addEventListener(
            "click",
            async function () {
                try {
                    await loadSampleByIndex(nextSampleIndex);

                } catch (error) {
                    alert(
                        "Không thể tải mẫu tiếp theo: " +
                        error.message
                    );

                    console.error(
                        "Lỗi tải mẫu tiếp theo:",
                        error
                    );
                }
            }
        );
    }
}

// ==========================================
// 10. NÚT PHÂN TÍCH MẪU
// ==========================================

function initPredictionForm() {
    const container = document.getElementById("feature-form");
    const button = document.getElementById("predict-btn");
    const resultBox = document.getElementById("prediction-result");

    if (!container || !button || !resultBox) {
        console.error("Thiếu phần tử của giao diện dự đoán.");
        return;
    }

    button.addEventListener("click", async function (event) {
        event.preventDefault();

        console.log("Đã nhấn nút Phân tích mẫu.");

        const inputs = Array.from(
            container.querySelectorAll("input[name]")
        );

        if (inputs.length !== 30) {
            showResultMessage(
                resultBox,
                "Chưa có đủ 30 ô nhập liệu. Hãy tải lại trang.",
                "error"
            );
            return;
        }

        const features = {};

        for (const input of inputs) {
            if (!input.reportValidity()) {
                return;
            }

            const rawValue = input.value.trim();

            if (rawValue === "") {
                showResultMessage(
                    resultBox,
                    "Vui lòng nhập đầy đủ thông số. Ô còn thiếu: " +
                    input.name,
                    "error"
                );

                input.focus();
                return;
            }

            const number = Number(rawValue);

            if (!Number.isFinite(number)) {
                showResultMessage(
                    resultBox,
                    "Giá trị không hợp lệ ở đặc trưng: " +
                    input.name,
                    "error"
                );

                input.focus();
                return;
            }

            features[input.name] = number;
        }

        const originalText = button.textContent;

        button.disabled = true;
        button.textContent = "Đang xử lý...";

        showResultMessage(
            resultBox,
            "Đang gửi 30 đặc trưng đến mô hình SVM RBF..."
        );

        try {
            const data = await apiRequest("/api/predict", {
                method: "POST",
                body: JSON.stringify({
                    features: features
                })
            });

            renderPredictionResult(data, resultBox);

            console.log("API dự đoán đã trả về kết quả.");

        } catch (error) {
            showResultMessage(
                resultBox,
                "Không thể hoàn thành dự đoán: " +
                error.message,
                "error"
            );

            console.error("Lỗi dự đoán:", error);

        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    });
}

// ==========================================
// 11. HIỂN THỊ KẾT QUẢ DỰ ĐOÁN
// ==========================================

function renderPredictionResult(data, resultBox) {
    resultBox.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Kết quả phân tích";
    resultBox.appendChild(heading);

    const prediction = String(
        data.prediction_vi || data.prediction || ""
    ).toLowerCase();

    const status = document.createElement("div");
    status.className = "result-status";

    if (
        prediction.includes("malignant") ||
        prediction.includes("ác tính")
    ) {
        status.classList.add("malignant");
        status.textContent =
            "Kết quả mô hình: Nghi ngờ ác tính";

    } else if (
        prediction.includes("benign") ||
        prediction.includes("lành tính")
    ) {
        status.classList.add("benign");
        status.textContent =
            "Kết quả mô hình: Nghi ngờ lành tính";

    } else {
        status.textContent =
            "Nhãn dự đoán chưa xác định: " +
            (prediction || "không có nhãn");
    }

    resultBox.appendChild(status);

    const malignantProbability =
        Number(data.malignant_probability);

    const benignProbability =
        Number(data.benign_probability);

    if (Number.isFinite(malignantProbability)) {
        const detail = document.createElement("p");
        detail.className = "result-detail";

        detail.textContent =
            "Xác suất ác tính: " +
            (malignantProbability * 100).toFixed(2) + "%";

        resultBox.appendChild(detail);
    }

    if (Number.isFinite(benignProbability)) {
        const detail = document.createElement("p");
        detail.className = "result-detail";

        detail.textContent =
            "Xác suất lành tính: " +
            (benignProbability * 100).toFixed(2) + "%";

        resultBox.appendChild(detail);
    }

    if (
        data.threshold !== undefined &&
        data.threshold !== null
    ) {
        const threshold = document.createElement("p");
        threshold.className = "result-detail";

        threshold.textContent =
            "Ngưỡng phân loại: " +
            (Number(data.threshold) * 100).toFixed(2) + "%";

        resultBox.appendChild(threshold);
    }

    const note = document.createElement("p");
    note.className = "result-detail";

    note.textContent =
        data.note ||
        "Kết quả phục vụ học tập và nghiên cứu, " +
        "không thay thế kết luận chẩn đoán của bác sĩ.";

    resultBox.appendChild(note);

    showResultBox(resultBox);
}

// ==========================================
// 12. TẢI KẾT QUẢ ĐÁNH GIÁ MÔ HÌNH
// ==========================================

async function loadEvaluation() {
    const head = document.getElementById("evaluation-head");
    const body = document.getElementById("evaluation-body");
    const message = document.getElementById("evaluation-message");

    if (!head || !body) return;

    try {
        hideMessage(message);

        const data = await apiRequest("/api/evaluation");
        const models = data.models || data.metrics || [];

        head.replaceChildren();
        body.replaceChildren();

        if (!models.length) {
            showMessage(
                message,
                "Chưa có dữ liệu đánh giá mô hình.",
                "info"
            );
            return;
        }

        const columns =
            data.columns || Object.keys(models[0]);

        const headerRow = document.createElement("tr");

        columns.forEach(function (column) {
            const th = document.createElement("th");
            th.textContent = column;
            headerRow.appendChild(th);
        });

        head.appendChild(headerRow);

        models.forEach(function (model) {
            const row = document.createElement("tr");

            columns.forEach(function (column) {
                const cell = document.createElement("td");
                const value = model[column];

                if (
                    typeof value === "number" &&
                    Number.isFinite(value)
                ) {
                    cell.textContent = value.toFixed(4);
                    cell.classList.add("metric-value");
                } else {
                    cell.textContent =
                        value === undefined || value === null
                            ? "—"
                            : String(value);
                }

                row.appendChild(cell);
            });

            body.appendChild(row);
        });

        renderModelChart(models);

    } catch (error) {
        showMessage(
            message,
            "Không tải được dữ liệu đánh giá: " +
            error.message,
            "error"
        );

        console.error("Lỗi đánh giá:", error);
    }
}

// ==========================================
// 13. BIỂU ĐỒ SO SÁNH MÔ HÌNH
// ==========================================

function renderModelChart(models) {
    const canvas = document.getElementById("model-chart");

    if (
        !canvas ||
        typeof Chart === "undefined" ||
        !models.length
    ) {
        return;
    }

    const firstModel = models[0];

    const metricCandidates = [
        "AUC_Mean",
        "Accuracy_Mean",
        "F1_Mean",
        "AUC",
        "auc",
        "F1",
        "f1",
        "Accuracy",
        "accuracy"
    ];

    const metric = metricCandidates.find(function (key) {
        return Object.prototype.hasOwnProperty.call(
            firstModel,
            key
        );
    });

    if (!metric) {
        console.warn(
            "Không tìm thấy chỉ số AUC, Accuracy hoặc F1."
        );
        return;
    }

    const labels = models.map(function (model) {
        return String(
            model.Model ||
            model.model ||
            model.name ||
            "Mô hình"
        );
    });

    const values = models.map(function (model) {
        const value = model[metric];

        return value === null || value === undefined
            ? NaN
            : Number(value);
    });

    if (values.some(function (value) {
        return !Number.isFinite(value);
    })) {
        console.warn("Dữ liệu biểu đồ có giá trị không hợp lệ.");
        return;
    }

    if (modelChart) {
        modelChart.destroy();
        modelChart = null;
    }

    modelChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [{
                label: metric,
                data: values,
                backgroundColor: "#13a89e",
                borderRadius: 7,
                maxBarThickness: 48
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 1,
                    ticks: {
                        callback: function (value) {
                            return (
                                Number(value) * 100
                            ).toFixed(0) + "%";
                        }
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 35,
                        minRotation: 0
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return metric + ": " +
                                (
                                    Number(context.raw) * 100
                                ).toFixed(2) + "%";
                        }
                    }
                }
            }
        }
    });
}

// ==========================================
// 14. NÚT LÀM MỚI ĐÁNH GIÁ
// ==========================================

function initRefreshButton() {
    const button = document.getElementById(
        "refresh-evaluation"
    );

    if (!button) return;

    button.addEventListener("click", function () {
        loadEvaluation();
    });
}

// ==========================================
// 15. KHỞI ĐỘNG ỨNG DỤNG
// ==========================================

document.addEventListener(
    "DOMContentLoaded",
    async function () {
        initNavigation();
        initRefreshButton();

        // Tạo 30 ô nhập trước khi đăng ký sự kiện dự đoán
        const initialized = await initFeatureInputs();

        initSampleButton();
        initPredictionForm();

        loadOverview();

        if (!initialized) {
            console.error(
                "Giao diện dự đoán chưa sẵn sàng."
            );
        }
    }
);
