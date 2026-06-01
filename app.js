/* ==========================================================================
   청춘작당 MATCHMAKER Premium Javascript Core
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 상태 변수 정의 (State)
    let rawCsvData = [];      // 파싱된 원본 2차원 배열 데이터
    let csvHeaders = [];      // CSV 파일의 헤더 목록
    let participants = [];    // 정제된 참가자 객체 목록
    let matchedCouples = [];  // 매칭된 커플 결과 목록
    let unmatchedList = [];   // 미매칭 참가자 목록
    
    // 매핑 필드 정의
    const requiredFields = [
        { id: 'name', label: '이름 (필수)', keywords: ['이름', '성명', 'name', '참가자'] },
        { id: 'gender', label: '성별 (필수)', keywords: ['성별', '성', 'gender', '남녀'] },
        { id: 'choice1', label: '1순위 선호 이성 (필수)', keywords: ['1순위', '1지망', '첫번째', '1st', 'first'] },
        { id: 'choice2', label: '2순위 선호 이성 (필수)', keywords: ['2순위', '2지망', '두번째', '2nd', 'second'] },
        { id: 'choice3', label: '3순위 선호 이성 (필수)', keywords: ['3순위', '3지망', '세번째', '3rd', 'third'] }
    ];
    let columnMapping = {};   // { fieldId: csvColumnIndex }

    // 2. DOM 요소 참조
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fileInfoText = document.getElementById('file-info-text');
    const btnDemo = document.getElementById('btn-demo');
    const btnDownloadSample = document.getElementById('btn-download-sample');
    
    const statusCard = document.getElementById('status-card');
    const welcomeCard = document.getElementById('welcome-card');
    const resultsCard = document.getElementById('results-card');
    
    const countTotalEl = document.getElementById('count-total');
    const countMaleEl = document.getElementById('count-male');
    const countFemaleEl = document.getElementById('count-female');
    const validationCountEl = document.getElementById('validation-count');
    const validationListEl = document.getElementById('validation-list');
    const btnRunMatching = document.getElementById('btn-run-matching');
    
    const mapperModal = document.getElementById('mapper-modal');
    const mappingTbody = document.getElementById('mapping-tbody');
    const btnCloseMapper = document.getElementById('btn-close-mapper');
    const btnConfirmMapper = document.getElementById('btn-confirm-mapper');
    
    // 결과 관련
    const statCoupleCount = document.getElementById('stat-couple-count');
    const statMatchingRate = document.getElementById('stat-matching-rate');
    const statAvgSatisfaction = document.getElementById('stat-avg-satisfaction');
    
    const countCouplesTab = document.getElementById('count-couples-tab');
    const countUnmatchedTab = document.getElementById('count-unmatched-tab');
    
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    const couplesContainer = document.getElementById('couples-container');
    const unmatchedTbody = document.getElementById('unmatched-tbody');
    const detailsTbody = document.getElementById('details-tbody');
    
    const searchCouplesEl = document.getElementById('search-couples');
    const filterCoupleTypeEl = document.getElementById('filter-couple-type');
    const searchUnmatchedEl = document.getElementById('search-unmatched');
    
    const btnPrint = document.getElementById('btn-print');
    const printSection = document.getElementById('print-section');

    // 4. 드래그 앤 드롭 & 파일 로딩 이벤트 바인딩
    dropZone.addEventListener('click', () => fileInput.click());
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    ['dragleave', 'dragend'].forEach(type => {
        dropZone.addEventListener(type, () => {
            dropZone.classList.remove('dragover');
        });
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
    
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // 5. CSV 파싱 및 처리 핵심 로직
    function handleFile(file) {
        if (!file.name.endsWith('.csv')) {
            alert('CSV 형식의 파일만 업로드할 수 있습니다.');
            return;
        }
        
        fileInfoText.textContent = `${file.name} (${formatBytes(file.size)})`;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            parseCSV(text);
        };
        // 한국어 완성형(EUC-KR / CP949) 및 UTF-8 모두 안정적으로 대응하기 위한 처리
        // 보통 엑셀에서 만든 CSV는 EUC-KR일 확률이 높으나 웰메이드 웹 서비스는 UTF-8이 대다수이므로
        // 첫 바이트들을 검사하거나 우선 UTF-8로 시도해보고 깨짐 여부를 판단할 수도 있으나,
        // 여기선 기본 UTF-8로 읽고 깨질 경우 사용자에게 피드백을 주는 가이드라인을 제공합니다.
        reader.readAsText(file, 'UTF-8');
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 견고한 CSV 파서 (따옴표 및 줄바꿈 대응)
    function parseCSV(text) {
        const lines = [];
        let row = [];
        let entry = '';
        let inQuotes = false;
        
        // 쉼표(,) 혹은 세미콜론(;) 구분자 자동 감지
        const firstLine = text.split(/\r?\n/)[0] || '';
        const commaCount = (firstLine.match(/,/g) || []).length;
        const semicolonCount = (firstLine.match(/;/g) || []).length;
        const delimiter = commaCount >= semicolonCount ? ',' : ';';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i+1];
            
            if (char === '"') {
                if (inQuotes && nextChar === '"') { // 이중 따옴표 이스케이프
                    entry += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes; // 따옴표 열기/닫기
                }
            } else if (char === delimiter && !inQuotes) {
                row.push(entry.trim());
                entry = '';
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (char === '\r' && nextChar === '\n') {
                    i++;
                }
                row.push(entry.trim());
                if (row.length > 0 && row.some(cell => cell !== '')) {
                    lines.push(row);
                }
                row = [];
                entry = '';
            } else {
                entry += char;
            }
        }
        
        if (entry || row.length > 0) {
            row.push(entry.trim());
            if (row.some(cell => cell !== '')) {
                lines.push(row);
            }
        }
        
        if (lines.length < 2) {
            alert('CSV 데이터가 부족합니다. 최소 헤더 행 1개와 데이터 행 1개가 필요합니다.');
            return;
        }
        
        csvHeaders = lines[0];
        rawCsvData = lines.slice(1);
        
        showColumnMapper();
    }

    // 6. 열 매핑 모달 GUI 오픈 및 자동 매핑 매칭
    function showColumnMapper() {
        mappingTbody.innerHTML = '';
        columnMapping = {};

        requiredFields.forEach(field => {
            const tr = document.createElement('tr');
            
            const tdLabel = document.createElement('td');
            tdLabel.className = 'mapping-field-name';
            tdLabel.textContent = field.label;
            
            const tdFieldId = document.createElement('td');
            tdFieldId.innerHTML = `<code style="color: var(--color-indigo); font-family: var(--font-outfit);">${field.id}</code>`;
            
            const tdSelect = document.createElement('td');
            const select = document.createElement('select');
            select.className = 'mapping-select';
            select.dataset.fieldId = field.id;
            
            // 빈 선택 옵션
            const optNone = document.createElement('option');
            optNone.value = '';
            optNone.textContent = '-- 열 선택 --';
            select.appendChild(optNone);
            
            // CSV 헤더 기반 선택 옵션 추가 및 자동 완성
            let bestMatchIndex = -1;
            let highestMatchScore = 0;
            
            csvHeaders.forEach((header, index) => {
                const opt = document.createElement('option');
                opt.value = index;
                opt.textContent = `${header} (열 ${index + 1})`;
                select.appendChild(opt);
                
                // 단어 일치 알고리즘으로 자동 지정 (가장 어울리는 열 추천)
                field.keywords.forEach(keyword => {
                    if (header.toLowerCase().includes(keyword.toLowerCase())) {
                        bestMatchIndex = index;
                    }
                });
            });
            
            if (bestMatchIndex !== -1) {
                select.value = bestMatchIndex;
                columnMapping[field.id] = bestMatchIndex;
            }
            
            tdSelect.appendChild(select);
            tr.appendChild(tdLabel);
            tr.appendChild(tdFieldId);
            tr.appendChild(tdSelect);
            
            mappingTbody.appendChild(tr);
        });
        
        mapperModal.classList.remove('hidden');
    }

    // 컬럼 매핑 저장 및 참가자 객체 생성
    btnConfirmMapper.addEventListener('click', () => {
        const selects = document.querySelectorAll('.mapping-select');
        let allRequiredMapped = true;
        
        selects.forEach(select => {
            const fieldId = select.dataset.fieldId;
            const value = select.value;
            
            if (value === '') {
                allRequiredMapped = false;
            }
            
            if (value !== '') {
                columnMapping[fieldId] = parseInt(value);
            } else {
                delete columnMapping[fieldId];
            }
        });
        
        if (!allRequiredMapped) {
            alert('필수 데이터 항목(이름, 성별, 1/2/3순위)의 열 매핑을 모두 완료해 주세요.');
            return;
        }
        
        mapperModal.classList.add('hidden');
        processParticipantsData();
    });

    btnCloseMapper.addEventListener('click', () => {
        mapperModal.classList.add('hidden');
    });

    // 7. 참가자 데이터 정제 및 유효성 진단
    function processParticipantsData() {
        participants = [];
        const validationLogs = [];
        
        const nameMap = new Map(); // 동명이인 확인용
        
        rawCsvData.forEach((row, rowIndex) => {
            const name = sanitizeName(row[columnMapping['name']]);
            const gender = sanitizeGender(row[columnMapping['gender']]);
            const choice1 = sanitizeName(row[columnMapping['choice1']]);
            const choice2 = sanitizeName(row[columnMapping['choice2']]);
            const choice3 = sanitizeName(row[columnMapping['choice3']]);
            
            if (!name) {
                validationLogs.push({
                    type: 'error',
                    message: `[행 ${rowIndex + 2}] 참가자 이름이 비어있어 제외 처리되었습니다.`
                });
                return;
            }
            
            if (!gender) {
                validationLogs.push({
                    type: 'error',
                    message: `[${name}]님의 성별 정보가 부정확합니다. '남' 또는 '여'로 인식되어야 합니다.`
                });
                return;
            }
            
            // 동명이인 감지
            if (nameMap.has(name)) {
                validationLogs.push({
                    type: 'error',
                    message: `[동명이인 오류] '${name}' 이름이 중복 검출되었습니다. 매칭 혼선을 방지하기 위해 이름을 고유하게 변경해 주세요(예: 홍길동A, 홍길동B).`
                });
            }
            nameMap.set(name, true);
            
            participants.push({
                name,
                gender,
                choices: [choice1, choice2, choice3],
                matched: false
            });
        });
        
        // 2단계 유효성 검사: 존재하지 않는 이성 지목 여부 확인
        const allParticipantNames = participants.map(p => p.name);
        
        participants.forEach(p => {
            p.choices.forEach((choice, index) => {
                if (choice) {
                    if (!allParticipantNames.includes(choice)) {
                        validationLogs.push({
                            type: 'warning',
                            message: `[오타 의심] '${p.name}'님이 지목한 ${index + 1}순위 '${choice}'님은 전체 참가자 명단에 존재하지 않습니다.`
                        });
                    } else {
                        // 지목한 대상의 성별 확인 (동성 매칭 비허용 시 주의)
                        const target = participants.find(part => part.name === choice);
                        if (target && target.gender === p.gender) {
                            validationLogs.push({
                                type: 'warning',
                                message: `[성별 일치] '${p.name}'님이 지목한 ${index + 1}순위 '${choice}'님은 동일한 성별(${p.gender})입니다. 이성 매칭만 지원하므로 매칭 스코어가 발생하지 않습니다.`
                            });
                        }
                    }
                } else {
                    validationLogs.push({
                        type: 'warning',
                        message: `[지목 누락] '${p.name}'님의 ${index + 1}순위 지목란이 비어 있습니다.`
                    });
                }
            });
        });
        
        // UI 반영
        welcomeCard.classList.add('hidden');
        resultsCard.classList.add('hidden');
        statusCard.classList.remove('hidden');
        
        // 카운트 채우기
        countTotalEl.textContent = `${participants.length}명`;
        const maleCount = participants.filter(p => p.gender === '남').length;
        const femaleCount = participants.filter(p => p.gender === '여').length;
        countMaleEl.textContent = `${maleCount}명`;
        countFemaleEl.textContent = `${femaleCount}명`;
        
        // 밸리데이션 로그 출력
        validationListEl.innerHTML = '';
        validationCountEl.textContent = validationLogs.length;
        
        if (validationLogs.length === 0) {
            validationListEl.innerHTML = '<div class="empty-validation">✅ 데이터 검사 결과 분석을 바로 진행할 수 있는 이상적인 상태입니다!</div>';
            btnRunMatching.disabled = false;
        } else {
            validationLogs.forEach(log => {
                const logItem = document.createElement('div');
                logItem.className = `validation-item ${log.type}`;
                logItem.innerHTML = `<span>${log.type === 'error' ? '❌' : '⚠️'}</span> <p>${log.message}</p>`;
                validationListEl.appendChild(logItem);
            });
            
            // 치명적 에러가 있으면 매칭 실행 버튼을 비활성화하고, 경고만 있으면 실행 가능
            const hasFatalError = validationLogs.some(log => log.type === 'error');
            btnRunMatching.disabled = hasFatalError;
            if (hasFatalError) {
                validationListEl.innerHTML += '<div style="color:#ef4444; font-size:0.8rem; font-weight:700; margin-top:10px;">※ 이름 중복 등 치명적인 에러가 존재하여 매칭을 진행할 수 없습니다. CSV 파일을 수정한 후 다시 업로드해 주세요.</div>';
            }
        }
    }

    // 문자열 다듬기 헬퍼들
    function sanitizeName(val) {
        if (!val) return '';
        // 앞뒤 공백 및 괄호/특수기호 제거, 공백 다듬기
        return val.toString().replace(/[\s\t\n]+/g, '').trim();
    }

    function sanitizeGender(val) {
        if (!val) return null;
        const clean = val.toString().trim();
        if (clean.includes('남') || clean.toLowerCase() === 'm' || clean.toLowerCase() === 'male' || clean.includes('남자')) {
            return '남';
        }
        if (clean.includes('여') || clean.toLowerCase() === 'f' || clean.toLowerCase() === 'female' || clean.includes('여자')) {
            return '여';
        }
        return null;
    }

    // 8. 가중치 기반 탐욕적(Greedy) 매칭 알고리즘 코어
    btnRunMatching.addEventListener('click', () => {
        // 참가자 상태 리셋
        participants.forEach(p => p.matched = false);
        matchedCouples = [];
        unmatchedList = [];
        
        const w1 = 10;
        const w2 = 5;
        const w3 = 2;
        const wBonus = 100;
        const mutualOnly = true;
        const allowSameGender = false;
        
        const weightMap = [w1, w2, w3]; // 0: 1순위, 1: 2순위, 2: 3순위

        // 모든 가능한 매칭 쌍 생성 및 점수 산정
        const allPossiblePairs = [];
        
        for (let i = 0; i < participants.length; i++) {
            for (let j = i + 1; j < participants.length; j++) {
                const p1 = participants[i];
                const p2 = participants[j];
                
                // 성별 필터
                if (!allowSameGender && p1.gender === p2.gender) {
                    continue; // 동성 매칭 불허 시 스킵
                }
                
                // p1 -> p2 선호도 점수 계산
                const p1ToP2Index = p1.choices.indexOf(p2.name);
                const p1ToP2Weight = p1ToP2Index !== -1 ? weightMap[p1ToP2Index] : 0;
                
                // p2 -> p1 선호도 점수 계산
                const p2ToP1Index = p2.choices.indexOf(p1.name);
                const p2ToP1Weight = p2ToP1Index !== -1 ? weightMap[p2ToP1Index] : 0;
                
                let score = 0;
                let isMutual = false;
                let matchType = '';
                
                if (p1ToP2Weight > 0 && p2ToP1Weight > 0) {
                    // 상호 매칭의 경우
                    score = p1ToP2Weight + p2ToP1Weight + wBonus;
                    isMutual = true;
                    
                    // 세부 매칭 등급 분류
                    const r1 = p1ToP2Index + 1;
                    const r2 = p2ToP1Index + 1;
                    if (r1 === 1 && r2 === 1) {
                        matchType = 'mutual-1-1'; // 1순위 상호
                    } else if (r1 <= 2 && r2 <= 2) {
                        matchType = 'mutual-high'; // 상호 1~2순위
                    } else {
                        matchType = 'mutual'; // 기타 일반 상호
                    }
                } else if (!mutualOnly && (p1ToP2Weight > 0 || p2ToP1Weight > 0)) {
                    // 일방 매칭의 경우 (상호 매칭 전용 모드가 아닐 때)
                    score = p1ToP2Weight + p2ToP1Weight;
                    isMutual = false;
                    matchType = 'onesided';
                }
                
                if (score > 0) {
                    allPossiblePairs.push({
                        p1,
                        p2,
                        score,
                        isMutual,
                        matchType,
                        p1ChoiceRank: p1ToP2Index + 1, // 0이면 무지망
                        p2ChoiceRank: p2ToP1Index + 1
                    });
                }
            }
        }
        
        // 탐욕적 매칭을 위해 스코어 기준 내림차순 정렬
        // 동점자일 시: 1순위 상호 매칭이 무조건 일방 매칭보다 우위가 될 수 있도록 2차, 3차 정렬 기준 수립
        allPossiblePairs.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            // 동점 시 상호 매칭인 것을 먼저
            if (b.isMutual !== a.isMutual) {
                return b.isMutual ? 1 : -1;
            }
            // 그마저도 같다면 매칭 순위의 합이 작은 것(더 높은 만족도)을 우선
            const sumA = (a.p1ChoiceRank || 9) + (a.p2ChoiceRank || 9);
            const sumB = (b.p1ChoiceRank || 9) + (b.p2ChoiceRank || 9);
            if (sumA !== sumB) {
                return sumA - sumB;
            }
            // 완벽한 동일 조건일 시 알파벳 순 정렬 (결과의 일관성 보장)
            return (a.p1.name + a.p2.name).localeCompare(b.p1.name + b.p2.name);
        });
        
        // 동점 경합(동일 점수에서 한 사람을 두고 경쟁) 감지
        const conflictPairs = new Set();
        for (let i = 0; i < allPossiblePairs.length; i++) {
            const pairA = allPossiblePairs[i];
            for (let j = i + 1; j < allPossiblePairs.length; j++) {
                const pairB = allPossiblePairs[j];
                // 점수가 완전히 같고
                if (pairA.score === pairB.score) {
                    // 한 사람을 공유하는 경우 (경합 발생)
                    if (pairA.p1.name === pairB.p1.name || 
                        pairA.p1.name === pairB.p2.name || 
                        pairA.p2.name === pairB.p1.name || 
                        pairA.p2.name === pairB.p2.name) {
                        conflictPairs.add(pairA);
                        conflictPairs.add(pairB);
                    }
                }
            }
        }
        
        // 탐욕 매칭 연산 실행 (동점 경합자 발생 시 주최자 확인을 위해 둘 다 표기)
        allPossiblePairs.forEach(pair => {
            const isPairConflict = conflictPairs.has(pair);
            
            if (isPairConflict) {
                // 경합 쌍의 경우: 둘 다 아직 다른 비경합 매칭에 매칭되지 않았다면 매칭 리스트에 추가
                // (공유된 사람이 이미 다른 경합으로 매칭되었더라도 둘 다 보여주기 위해 허용!)
                if (!pair.p1.nonConflictMatched && !pair.p2.nonConflictMatched) {
                    // 경합에 포함된 사람들을 마킹하여 더 낮은 점수의 매칭에서 배제
                    pair.p1.matched = true;
                    pair.p2.matched = true;
                    
                    matchedCouples.push({
                        male: pair.p1.gender === '남' ? pair.p1 : pair.p2,
                        female: pair.p1.gender === '여' ? pair.p1 : pair.p2,
                        p1: pair.p1,
                        p2: pair.p2,
                        score: pair.score,
                        isMutual: pair.isMutual,
                        matchType: pair.matchType,
                        p1Rank: pair.p1ChoiceRank,
                        p2Rank: pair.p2ChoiceRank,
                        isConflict: true
                    });
                }
            } else {
                // 일반 쌍의 경우: 둘 다 매칭되지 않은 경우에만 진행
                if (!pair.p1.matched && !pair.p2.matched) {
                    pair.p1.matched = true;
                    pair.p2.matched = true;
                    pair.p1.nonConflictMatched = true;
                    pair.p2.nonConflictMatched = true;
                    
                    matchedCouples.push({
                        male: pair.p1.gender === '남' ? pair.p1 : pair.p2,
                        female: pair.p1.gender === '여' ? pair.p1 : pair.p2,
                        p1: pair.p1,
                        p2: pair.p2,
                        score: pair.score,
                        isMutual: pair.isMutual,
                        matchType: pair.matchType,
                        p1Rank: pair.p1ChoiceRank,
                        p2Rank: pair.p2ChoiceRank,
                        isConflict: false
                    });
                }
            }
        });
        
        // 미매칭자 리스트 업
        participants.forEach(p => {
            if (!p.matched) {
                // 나를 지목한 이성 수 카운트
                const chosenMeCount = participants.filter(other => 
                    other.gender !== p.gender && other.choices.includes(p.name)
                ).length;
                
                unmatchedList.push({
                    ...p,
                    chosenMeCount
                });
            }
        });
        
        // 9. 결과 렌더링 및 통계 시각화
        renderMatchingResults();
    });

    // 결과 렌더링 함수
    function renderMatchingResults() {
        // UI 전환
        statusCard.classList.add('hidden');
        resultsCard.classList.remove('hidden');
        
        // 1. 통계치 계산 및 카운팅 애니메이션 실행 (경합 중복 제거)
        const uniqueMatchedFemales = new Set(matchedCouples.map(c => c.female.name));
        const coupleCount = uniqueMatchedFemales.size;
        const totalParticipants = participants.length;
        const matchedPeopleCount = coupleCount * 2;
        const matchingRate = totalParticipants > 0 ? Math.round((matchedPeopleCount / totalParticipants) * 100) : 0;
        
        // 만족도 점수 평균 산출 (최고 10점 만점으로 스케일링)
        // 1순위=10, 2순위=5, 3순위=2점 만족도로 환산
        let totalSatisfyPoints = 0;
        let totalSatisfyCount = 0;
        
        matchedCouples.forEach(c => {
            const rankToPoints = (rank) => {
                if (rank === 1) return 10;
                if (rank === 2) return 5;
                if (rank === 3) return 2;
                return 0;
            };
            
            if (c.p1Rank > 0) {
                totalSatisfyPoints += rankToPoints(c.p1Rank);
                totalSatisfyCount++;
            }
            if (c.p2Rank > 0) {
                totalSatisfyPoints += rankToPoints(c.p2Rank);
                totalSatisfyCount++;
            }
        });
        
        const avgSatisfaction = totalSatisfyCount > 0 ? (totalSatisfyPoints / totalSatisfyCount).toFixed(1) : '0.0';
        
        animateCount(statCoupleCount, coupleCount);
        animateCount(statMatchingRate, matchingRate, '%');
        animateCount(statAvgSatisfaction, parseFloat(avgSatisfaction), '', true);
        
        // 탭 숫자에 할당
        countCouplesTab.textContent = coupleCount;
        countUnmatchedTab.textContent = unmatchedList.length;
        
        // 2. 리스트 빌드
        filterAndRenderCouples();
        renderUnmatchedTable();
        renderDetailsTable();
    }

    // 카운팅 애니메이션 유틸
    function animateCount(el, target, suffix = '', isFloat = false) {
        let start = 0;
        const duration = 800; // ms
        const startTime = performance.now();
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // EaseOutQuad
            const easeProgress = progress * (2 - progress);
            const current = start + easeProgress * (target - start);
            
            el.textContent = isFloat ? current.toFixed(1) + suffix : Math.floor(current) + suffix;
            
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.textContent = target + suffix;
            }
        }
        
        requestAnimationFrame(update);
    }

    // 10. 탭 인터랙션 및 검색/필터 바인딩
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetTab = btn.dataset.tab;
            document.getElementById(targetTab).classList.add('active');
        });
    });

    // 커플 검색 & 필터 체인지 리스너
    searchCouplesEl.addEventListener('input', filterAndRenderCouples);
    filterCoupleTypeEl.addEventListener('change', filterAndRenderCouples);
    searchUnmatchedEl.addEventListener('input', renderUnmatchedTable);

    // 커플 필터링 렌더링 함수
    function filterAndRenderCouples() {
        couplesContainer.innerHTML = '';
        const searchWord = searchCouplesEl.value.toLowerCase().trim();
        const typeFilter = filterCoupleTypeEl.value;
        
        // 이전 알림 배너 삭제
        const existingBanner = document.getElementById('conflict-alert-banner');
        if (existingBanner) {
            existingBanner.remove();
        }
        
        // 동점 경합 커플 수 감지 및 상단 안내 배너 노출
        const conflictCouples = matchedCouples.filter(c => c.isConflict);
        if (conflictCouples.length > 0) {
            const contestedPeople = new Set();
            conflictCouples.forEach(c => {
                const sharedPerson = matchedCouples.some(oc => oc !== c && oc.male.name === c.male.name) ? c.male.name : c.female.name;
                contestedPeople.add(sharedPerson);
            });
            
            const banner = document.createElement('div');
            banner.id = 'conflict-alert-banner';
            banner.className = 'conflict-alert-box';
            banner.innerHTML = `
                <div class="conflict-alert-icon">⚠️</div>
                <div class="conflict-alert-content">
                    <div class="conflict-alert-title">주의: 조율이 필요한 동점 선택 대기 커플이 있습니다!</div>
                    <div class="conflict-alert-desc">
                        현재 동일한 선호 점수로 인해 <strong>${Array.from(contestedPeople).join(', ')}</strong>님에 대해 중복 매칭이 이루어졌습니다.<br>
                        아래 오렌지색 카드의 <strong>[이 매칭 최종 확정하기]</strong> 버튼을 누르면 관리자가 지정한 한 쪽 매칭이 성사되며, 다른 동점 후보들은 미매칭 목록으로 자동 이동하여 보고서가 완성됩니다.
                    </div>
                </div>
            `;
            couplesContainer.parentNode.insertBefore(banner, couplesContainer);
        }
        
        const filtered = matchedCouples.filter(c => {
            // 이름 검색
            const matchName = c.male.name.toLowerCase().includes(searchWord) || 
                              c.female.name.toLowerCase().includes(searchWord);
            
            // 종류 필터
            let matchType = false;
            if (typeFilter === 'all') {
                matchType = true;
            } else if (typeFilter === 'mutual-1-1') {
                matchType = c.matchType === 'mutual-1-1';
            } else if (typeFilter === 'mutual-high') {
                matchType = c.matchType === 'mutual-1-1' || c.matchType === 'mutual-high';
            } else if (typeFilter === 'mutual') {
                matchType = c.isMutual;
            } else if (typeFilter === 'onesided') {
                matchType = !c.isMutual;
            } else if (typeFilter === 'conflict') {
                matchType = c.isConflict === true;
            }
            
            return matchName && matchType;
        });
        
        if (filtered.length === 0) {
            couplesContainer.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-muted);">부합하는 매칭 완료 커플이 없습니다.</div>';
            return;
        }
        
        filtered.forEach(couple => {
            const card = document.createElement('div');
            
            // 만약 경합 카드인 경우
            if (couple.isConflict) {
                card.className = 'couple-card conflict-card';
            } else {
                card.className = `couple-card ${couple.matchType === 'mutual-1-1' ? 'mutual-1-1-card' : ''}`;
            }
            
            // 매칭 정보 배지 텍스트 결정
            let typeBadgeHtml = '';
            if (couple.isConflict) {
                typeBadgeHtml = '<span class="badge badge-warning">⚠️ 동점 선택 대기</span>';
            } else if (couple.matchType === 'mutual-1-1') {
                typeBadgeHtml = '<span class="badge badge-pink">💖 1순위 천생연분</span>';
            } else if (couple.matchType === 'mutual-high') {
                typeBadgeHtml = '<span class="badge badge-indigo">✨ 상호 매칭 우수</span>';
            } else if (couple.isMutual) {
                typeBadgeHtml = '<span class="badge badge-emerald">💚 상호 지목 매칭</span>';
            } else {
                typeBadgeHtml = '<span class="badge badge-blue">💙 일방 선호 매칭</span>';
            }
            
            const renderRankStr = (rank) => rank > 0 ? `${rank}순위` : '없음';
            
            card.innerHTML = `
                <div class="couple-card-top">
                    ${typeBadgeHtml}
                    <div class="couple-score" style="color: ${couple.isMutual ? 'var(--color-pink)' : 'var(--text-muted)'}">
                        매칭 지수: ${couple.score}점
                    </div>
                </div>
                <div class="couple-hearts">
                    <div class="couple-person">
                        <span class="person-name male-color">♂️ ${couple.male.name}</span>
                    </div>
                    <div class="love-heart">${couple.matchType === 'mutual-1-1' ? '💝' : '❤️'}</div>
                    <div class="couple-person">
                        <span class="person-name female-color">♀️ ${couple.female.name}</span>
                    </div>
                </div>
                <div class="couple-card-bottom">
                    선호 지목: 남성 → ${renderRankStr(couple.male.choices.indexOf(couple.female.name) + 1)} | 여성 → ${renderRankStr(couple.female.choices.indexOf(couple.male.name) + 1)}
                </div>
            `;
            
            // 경합 상태일 경우 설명 및 확정 버튼 추가
            if (couple.isConflict) {
                const competing = [];
                matchedCouples.forEach(oc => {
                    if (oc !== couple) {
                        if (oc.male.name === couple.male.name) competing.push(oc.female.name);
                        if (oc.female.name === couple.female.name) competing.push(oc.male.name);
                    }
                });
                const sharedPerson = matchedCouples.some(oc => oc !== couple && oc.male.name === couple.male.name) ? couple.male.name : couple.female.name;
                
                const reasonBoxHtml = `
                    <div class="conflict-reason-box">
                        <strong>⚠️ 동점 선택 대기:</strong><br>
                        <strong>${sharedPerson}</strong>님에 대해 <strong>${[sharedPerson, ...competing].join(', ')}</strong>님이 동일한 선호 점수(<strong>${couple.score}점</strong>)를 기록하여 조율 대기 중입니다.
                    </div>
                    <button class="btn-confirm-match" onclick="resolveConflict('${couple.male.name}', '${couple.female.name}')">
                        이 매칭 최종 확정하기
                    </button>
                `;
                card.innerHTML += reasonBoxHtml;
            }
            
            couplesContainer.appendChild(card);
        });
    }

    // 동점 경합 수동 확정 처리 함수
    window.resolveConflict = function(maleName, femaleName) {
        const targetCouple = matchedCouples.find(c => c.male.name === maleName && c.female.name === femaleName);
        if (!targetCouple) return;
        
        // 경합 관계에 있는 다른 모든 쌍 추출
        const competingCouples = matchedCouples.filter(c => 
            c !== targetCouple && (c.male.name === targetCouple.male.name || c.female.name === targetCouple.female.name)
        );
        
        if (competingCouples.length === 0) return;
        
        if (!confirm(`[${targetCouple.male.name} ❤️ ${targetCouple.female.name}] 매칭을 최종 확정하시겠습니까?\n동점 관계에 있던 다른 매칭 쌍들은 즉시 정리됩니다.`)) {
            return;
        }
        
        // 1. 타겟 커플의 경합 상태를 해제하고 일반 완료 매칭으로 전환
        targetCouple.isConflict = false;
        targetCouple.male.matched = true;
        targetCouple.female.matched = true;
        targetCouple.male.nonConflictMatched = true;
        targetCouple.female.nonConflictMatched = true;
        
        // 2. 경쟁하던 다른 동점 매칭들은 matchedCouples 배열에서 완전 제거 및 매칭 여부 리셋
        competingCouples.forEach(cc => {
            const idx = matchedCouples.indexOf(cc);
            if (idx !== -1) {
                matchedCouples.splice(idx, 1);
            }
            
            // 타겟 커플에 속하지 않고, 경쟁에 밀려 탈락한 참여자 탐색
            const lostParticipant = (cc.male.name === targetCouple.male.name || cc.male.name === targetCouple.female.name) ? cc.female : cc.male;
            
            lostParticipant.matched = false;
            lostParticipant.nonConflictMatched = false;
        });
        
        // 3. 탈락자가 미매칭 명단으로 복귀할 수 있도록 unmatchedList 배열 재생성
        unmatchedList = [];
        participants.forEach(p => {
            if (!p.matched) {
                const chosenMeCount = participants.filter(other => 
                    other.gender !== p.gender && other.choices.includes(p.name)
                ).length;
                
                unmatchedList.push({
                    ...p,
                    chosenMeCount
                });
            }
        });
        
        // 4. 통계치 및 전체 레이아웃 리렌더링
        renderMatchingResults();
    };

    // 미매칭 테이블 렌더링
    function renderUnmatchedTable() {
        unmatchedTbody.innerHTML = '';
        const searchWord = searchUnmatchedEl.value.toLowerCase().trim();
        
        const filtered = unmatchedList.filter(p => p.name.toLowerCase().includes(searchWord));
        
        if (filtered.length === 0) {
            unmatchedTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">미매칭된 참가자가 없습니다.</td></tr>';
            return;
        }
        
        filtered.forEach(p => {
            const tr = document.createElement('tr');
            
            // 1,2,3순위 리스트 빌드
            const choicesStr = p.choices.map((c, i) => c ? `${i+1}순위: ${c}` : `${i+1}순위: 없음`).join(', ');
            
            tr.innerHTML = `
                <td class="name-td ${p.gender === '남' ? 'male-color' : 'female-color'}">${p.gender === '남' ? '♂️' : '♀️'} ${p.name}</td>
                <td>${p.gender}</td>
                <td>${choicesStr}</td>
                <td style="font-weight: 700; color: ${p.chosenMeCount > 0 ? 'var(--color-pink)' : 'var(--text-muted)'}">${p.chosenMeCount}명</td>
            `;
            unmatchedTbody.appendChild(tr);
        });
    }

    // 디테일 전체 매칭 점수표 테이블 렌더링
    function renderDetailsTable() {
        detailsTbody.innerHTML = '';
        
        if (matchedCouples.length === 0) {
            detailsTbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px;">매칭된 기록이 없습니다.</td></tr>';
            return;
        }
        
        // 매칭 스코어 역순 정렬 리스트 뷰
        matchedCouples.forEach((c, index) => {
            const tr = document.createElement('tr');
            
            if (c.isConflict) {
                tr.className = 'table-row-conflict';
            }
            
            let typeLabel = '';
            if (c.isConflict) {
                typeLabel = '⚠️ 동점 선택 대기';
            } else if (c.matchType === 'mutual-1-1') {
                typeLabel = '💖 1-1 상호 지목';
            } else if (c.matchType === 'mutual-high') {
                typeLabel = '✨ 상호 우수 지목';
            } else if (c.isMutual) {
                typeLabel = '💚 상호 지목';
            } else {
                typeLabel = '💙 일방 지목';
            }
            
            const renderRankStr = (rank) => rank > 0 ? `${rank}순위` : '없음';
            const maleRank = c.male.choices.indexOf(c.female.name) + 1;
            const femaleRank = c.female.choices.indexOf(c.male.name) + 1;
            
            tr.innerHTML = `
                <td style="font-family: var(--font-outfit); font-weight:700;">${index + 1}</td>
                <td class="name-td">${c.male.name} ❤️ ${c.female.name}</td>
                <td>${renderRankStr(maleRank)}</td>
                <td>${renderRankStr(femaleRank)}</td>
                <td style="font-family: var(--font-outfit); font-weight:700; color:var(--color-pink);">${c.score}점</td>
                <td>${typeLabel}</td>
            `;
            detailsTbody.appendChild(tr);
        });
    }

    // 11. 데모 체험용 테스트 데이터 삽입
    btnDemo.addEventListener('click', () => {
        // 임의의 가상 청춘작당 참가자 생성 (남 10명, 여 10명)
        const demoCsv = `이름,성별,1순위,2순위,3순위
지철,남,수지,지원,유나
현우,남,지원,수지,민지
민수,남,유나,민지,수지
도윤,남,수지,민지,지원
재원,남,민지,유나,혜수
서준,남,수지,혜수,유나
준우,남,혜수,지원,민지
건우,남,유나,민지,수지
은우,남,지원,유나,혜수
진서,남,민지,혜수,수지
수지,여,지철,도윤,서준
지원,여,현우,은우,지철
민지,여,현우,도윤,재원
유나,여,민수,건우,지철
혜수,여,준우,서준,재원
지우,여,도윤,지철,현우
서현,여,서준,현우,민수
다은,여,진서,준우,건우
채원,여,지철,은우,도윤
하은,여,현우,민수,재원`;

        parseCSV(demoCsv);
    });

    // 템플릿 다운로드 기능
    btnDownloadSample.addEventListener('click', () => {
        const sampleContent = `이름,성별,1순위,2순위,3순위
홍길동,남,김영희,김철수,이영자
김철수,남,이영자,김영희,홍길동
김영희,여,홍길동,김철수,이영자
이영자,여,김철수,홍길동,김영희`;
        
        downloadCsvFile(sampleContent, '청춘작당_매칭_설문결과_템플릿.csv');
    });



    // CSV 파일 다운로드 유틸 (UTF-8 BOM 추가하여 엑셀 깨짐 원천 차단)
    function downloadCsvFile(content, fileName) {
        // \uFEFF 은 UTF-8 BOM 바이트마크로 Excel에서 한글 깨짐을 완벽 방증합니다.
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (navigator.msSaveBlob) { // IE 10+
            navigator.msSaveBlob(blob, fileName);
        } else {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', fileName);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // 13. 프린트용 인쇄 창 생성 및 구동
    btnPrint.addEventListener('click', () => {
        if (matchedCouples.length === 0) {
            alert('인쇄할 매칭 결과 데이터가 없습니다.');
            return;
        }
        
        // 인쇄용 컨테이너 조립
        let couplesHtml = '';
        matchedCouples.forEach((c, index) => {
            let typeBadge = '';
            let cardClass = 'couple-card';
            let conflictNoticeHtml = '';
            
            if (c.isConflict) {
                typeBadge = '⚠️ 동점 선택 대기';
                cardClass = 'couple-card conflict-card';
                
                const competing = [];
                matchedCouples.forEach(oc => {
                    if (oc !== c) {
                        if (oc.male.name === c.male.name) competing.push(oc.female.name);
                        if (oc.female.name === c.female.name) competing.push(oc.male.name);
                    }
                });
                const sharedPerson = matchedCouples.some(oc => oc !== c && oc.male.name === c.male.name) ? c.male.name : c.female.name;
                
                conflictNoticeHtml = `
                    <div class="conflict-reason-box" style="margin-top: 10px; padding: 10px; background: rgba(249, 115, 22, 0.08); border: 1px solid rgba(249, 115, 22, 0.2); border-radius: 8px; font-size: 0.78rem; color: #ff9d75; text-align: left; line-height: 1.4;">
                        <strong>⚠️ 동점 선택 대기:</strong> ${sharedPerson}님에 대해 ${[sharedPerson, ...competing].join(', ')}님이 동일한 선호 점수(${c.score}점)를 기록하여 조율 대기 중입니다.
                    </div>
                `;
            } else if (c.matchType === 'mutual-1-1') {
                typeBadge = '💖 1순위 천생연분';
            } else if (c.matchType === 'mutual-high') {
                typeBadge = '✨ 상호 우수';
            } else if (c.isMutual) {
                typeBadge = '💚 상호 지목';
            } else {
                typeBadge = '💙 일방 선호';
            }
            
            const maleRank = c.male.choices.indexOf(c.female.name) + 1;
            const femaleRank = c.female.choices.indexOf(c.male.name) + 1;
            const r1 = maleRank > 0 ? `${maleRank}순위` : '없음';
            const r2 = femaleRank > 0 ? `${femaleRank}순위` : '없음';
            
            couplesHtml += `
                <div class="${cardClass}">
                    <div class="couple-card-top">
                        <span class="badge ${c.isConflict ? 'badge-warning' : ''}">${typeBadge}</span>
                        <span class="couple-score">순위: ${index + 1} | 점수: ${c.score}점</span>
                    </div>
                    <div class="couple-hearts">
                        <div class="couple-person">
                            <span class="person-name" style="color: #3b82f6;">♂️ ${c.male.name}</span>
                        </div>
                        <div class="love-heart">❤️</div>
                        <div class="couple-person">
                            <span class="person-name" style="color: #ff4b72;">♀️ ${c.female.name}</span>
                        </div>
                    </div>
                    <div class="couple-card-bottom">
                        지목 결과: 남성 → ${r1} | 여성 → ${r2}
                    </div>
                    ${conflictNoticeHtml}
                </div>
            `;
        });
        
        const countTotal = participants.length;
        const countCouples = matchedCouples.length;
        const matchingRate = Math.round(((countCouples * 2) / countTotal) * 100);
        
        printSection.innerHTML = `
            <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px double #333; padding-bottom: 20px;">
                <h1 style="font-size: 28pt; margin: 0 0 10px 0; letter-spacing: 2px;">청춘작당 최종 매칭 결과 보고서</h1>
                <p style="font-size: 12pt; color: #555; margin: 0;">인쇄 일시: ${new Date().toLocaleString('ko-KR')}</p>
            </div>
            
            <div style="display: flex; justify-content: space-around; border: 1px solid #ccc; background: #f9f9f9; padding: 15px; margin-bottom: 30px; border-radius: 8px;">
                <div style="text-align: center;"><div style="font-size: 10pt; color: #666;">총 참가자</div><div style="font-size: 16pt; font-weight: bold;">${countTotal}명</div></div>
                <div style="text-align: center;"><div style="font-size: 10pt; color: #666;">성사 커플 수</div><div style="font-size: 16pt; font-weight: bold; color: red;">${countCouples}쌍</div></div>
                <div style="text-align: center;"><div style="font-size: 10pt; color: #666;">매칭 성공률</div><div style="font-size: 16pt; font-weight: bold;">${matchingRate}%</div></div>
                <div style="text-align: center;"><div style="font-size: 10pt; color: #666;">미매칭 인원</div><div style="font-size: 16pt; font-weight: bold;">${unmatchedList.length}명</div></div>
            </div>
            
            <h2 style="font-size: 16pt; border-left: 5px solid #ff4b72; padding-left: 10px; margin-bottom: 20px;">💖 커플 매칭 완료 목록</h2>
            <div class="couples-grid" style="margin-bottom: 40px;">
                ${couplesHtml}
            </div>
            
            <div style="page-break-before: always;"></div>
            
            <h2 style="font-size: 16pt; border-left: 5px solid #555; padding-left: 10px; margin-top: 30px; margin-bottom: 20px;">💔 미매칭 대상자 목록 (${unmatchedList.length}명)</h2>
            <table class="data-table" style="width:100%; border-collapse: collapse; border: 1px solid #ccc;">
                <thead>
                    <tr style="background: #f0f0f0;">
                        <th style="border: 1px solid #ccc; padding: 10px; text-align: left;">이름</th>
                        <th style="border: 1px solid #ccc; padding: 10px; text-align: left;">성별</th>
                        <th style="border: 1px solid #ccc; padding: 10px; text-align: left;">내가 지목한 1, 2, 3순위</th>
                    </tr>
                </thead>
                <tbody>
                    ${unmatchedList.map(p => `
                        <tr>
                            <td style="border: 1px solid #ccc; padding: 10px; font-weight: bold;">${p.name}</td>
                            <td style="border: 1px solid #ccc; padding: 10px;">${p.gender}</td>
                            <td style="border: 1px solid #ccc; padding: 10px;">${p.choices.map((c, i) => `${i+1}순위: ${c || '없음'}`).join(', ')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        window.print();
    });
});
