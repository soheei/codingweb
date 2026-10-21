// 코딩마스터스 100 챌린지 1번~100번 전체 실제 문제 데이터셋
export const ALL_100_REAL_QUESTIONS = [
  // 1 ~ 20 (기초)
  { id: 1, title: "10배", difficulty: "기초", category: "기초 문법", desc: "정수 n이 주어질 때 그 수의 10배를 출력하세요." },
  { id: 2, title: "16배 나누어 출력하기", difficulty: "기초", category: "수학/구현", desc: "주어진 정수를 16으로 나눈 몫을 구하세요." },
  { id: 3, title: "1등급 한우", difficulty: "기초", category: "조건문", desc: "근내지방도(BMS) 기준에 따른 한우 등급을 판정하세요." },
  { id: 4, title: "3으로 나눈 나머지", difficulty: "기초", category: "기초 문법", desc: "정수 n을 3으로 나눈 나머지를 구하세요." },
  { id: 5, title: "8진수와 16진수", difficulty: "기초", category: "수학/진법", desc: "10진수를 8진수와 16진수로 변환하여 출력하세요." },
  { id: 6, title: "You", difficulty: "기초", category: "문자열", desc: "문자열 안에 'You' 또는 'you'가 포함되어 있는지 판별하세요." },
  { id: 7, title: "가장 큰 나머지", difficulty: "기초", category: "수학/구현", desc: "정수 n을 나누었을 때 가능한 가장 큰 나머지를 구하세요." },
  { id: 8, title: "기억상실", difficulty: "기초", category: "반복문/수학", desc: "낮에 오르고 밤에 미끄러지는 달팽이의 정상 도달 일수를 계산하세요." },
  { id: 9, title: "등차수열", difficulty: "기초", category: "수학/구현", desc: "첫째 항 a, 공차 d일 때 n번째 항의 값을 구하세요." },
  { id: 10, title: "림보게임", difficulty: "기초", category: "조건문/반복문", desc: "참가자들의 키를 확인하여 림보 통과 실패자를 찾아내세요." },
  { id: 11, title: "비밀번호 찾기", difficulty: "기초", category: "문자열", desc: "규칙에 따라 힌트에서 비밀번호를 추출하세요." },
  { id: 12, title: "삼각형의 조건", difficulty: "기초", category: "기하/수학", desc: "세 변의 길이로 삼각형을 만들 수 있는지 판별하세요." },
  { id: 13, title: "소수 구하기", difficulty: "기초", category: "수학", desc: "자연수 N이 소수인지 판정하거나 N 이하의 소수를 구하세요." },
  { id: 14, title: "아까운 쿠폰", difficulty: "기초", category: "조건문/구현", desc: "구매 금액에 맞는 최적의 할인 쿠폰 혜택을 계산하세요." },
  { id: 15, title: "아스키 코드", difficulty: "기초", category: "문자열/기초", desc: "문자와 아스키 코드 값을 상호 변환하세요." },
  { id: 16, title: "아이디 만들기", difficulty: "기초", category: "문자열", desc: "아이디 생성 유효성 검사 규칙을 구현하세요." },
  { id: 17, title: "우리반 아이큐왕은", difficulty: "기초", category: "정렬/탐색", desc: "학생 목록에서 가장 높은 IQ를 가진 학생을 찾으세요." },
  { id: 18, title: "원의 넓이", difficulty: "기초", category: "기하/수학", desc: "반지름 r을 이용해 원의 넓이를 계산하세요." },
  { id: 19, title: "자녀의 키는", difficulty: "기초", category: "수학/구현", desc: "부모님의 신장을 바탕으로 예상 자녀 신장을 계산하세요." },
  { id: 20, title: "최대공약수", difficulty: "기초", category: "수학", desc: "두 수의 최대공약수(GCD)를 구하세요." },

  // 21 ~ 50 (초급)
  { id: 21, title: "N을 보는 시각", difficulty: "초급", category: "문자열/탐색", desc: "특정 시간대까지 숫자 N이 포함된 시각의 개수를 세세요." },
  { id: 22, title: "가우스와 정다각형", difficulty: "초급", category: "수학", desc: "작도 가능한 정다각형인지 판별하세요." },
  { id: 23, title: "계단", difficulty: "초급", category: "DP/수학", desc: "계단을 오르는 모든 경우의 수를 계산하세요." },
  { id: 24, title: "구간 단속", difficulty: "초급", category: "구현/시뮬레이션", desc: "단속 구간 통과 시간을 계산해 과속 여부를 판단하세요." },
  { id: 25, title: "구름 별", difficulty: "초급", category: "패턴/출력", desc: "규칙에 따라 구름과 별 모양 패턴을 출력하세요." },
  { id: 26, title: "기둥 세우기", difficulty: "초급", category: "그리디/구현", desc: "최적의 간격으로 기둥을 세우는 방법을 계산하세요." },
  { id: 27, title: "내 이름이 적힌 번호 찾기", difficulty: "초급", category: "탐색/자료구조", desc: "명단에서 특정 이름의 번호 인덱스를 찾으세요." },
  { id: 28, title: "누적 합", difficulty: "초급", category: "누적합", desc: "수열의 특정 구간 [L, R] 합을 빠르게 구하세요." },
  { id: 29, title: "두더지 게임", difficulty: "초급", category: "시뮬레이션", desc: "두더지가 나오는 격자에서 획득 점수를 계산하세요." },
  { id: 30, title: "몇 번씩 나올까", difficulty: "초급", category: "문자열/해시", desc: "1부터 N까지 적었을 때 각 자릿수 숫자의 빈도를 세세요." },
  { id: 31, title: "무향 그래프 1", difficulty: "초급", category: "그래프", desc: "무향 그래프의 인접 행렬/리스트를 생성하세요." },
  { id: 32, title: "문서 통계", difficulty: "초급", category: "문자열", desc: "문서의 단어 수, 글자 수, 문장 수를 통계 내세요." },
  { id: 33, title: "바닥 공사 1", difficulty: "초급", category: "DP", desc: "직사각형 바닥을 타일로 채우는 경우의 수를 구하세요." },
  { id: 34, title: "배수 만들기", difficulty: "초급", category: "수학/그리디", desc: "숫자 카드로 만들 수 있는 최대 배수를 구하세요." },
  { id: 35, title: "분리수거장", difficulty: "초급", category: "기하/탐색", desc: "주민들의 총 이동 거리를 최소화하는 분리수거장 위치를 찾으세요." },
  { id: 36, title: "분수를 소수로", difficulty: "초급", category: "수학", desc: "분수를 소수로 바꿀 때 순환마디 길이를 구하세요." },
  { id: 37, title: "사전 만들기", difficulty: "초급", category: "정렬", desc: "단어들을 길이와 사전 순으로 정렬하세요." },
  { id: 38, title: "설거지 담당", difficulty: "초급", category: "시뮬레이션", desc: "순번에 따라 최종 설거지 당번을 결정하세요." },
  { id: 39, title: "신입사원 채용", difficulty: "초급", category: "그리디/정렬", desc: "서류와 면접 성적을 고려해 선발 가능한 최대 인원을 구하세요." },
  { id: 40, title: "예비군 훈련", difficulty: "초급", category: "조건문/구현", desc: "전역 연차에 따른 예비군 훈련 유형을 판정하세요." },
  { id: 41, title: "오리 농법", difficulty: "초급", category: "시뮬레이션", desc: "논에서 오리가 이동하며 해충을 잡는 경로를 시뮬레이션하세요." },
  { id: 42, title: "이별 30분 전", difficulty: "초급", category: "시간/구현", desc: "주어진 시간의 30분 전 시각을 계산하세요." },
  { id: 43, title: "정렬된 많은 원소 사이에서 특정 값 찾기", difficulty: "초급", category: "이진 탐색", desc: "대규모 정렬 배열에서 이진 탐색으로 특정 값을 찾으세요." },
  { id: 44, title: "조합", difficulty: "초급", category: "수학/조합론", desc: "nCr 조합의 수를 계산하세요." },
  { id: 45, title: "주사위의 합", difficulty: "초급", category: "경우의 수", desc: "주사위 눈들의 합이 S가 되는 경우의 수를 구하세요." },
  { id: 46, title: "중앙 값", difficulty: "초급", category: "통계/정렬", desc: "수열의 중앙값(Median)을 구하세요." },
  { id: 47, title: "직각 삼각형", difficulty: "초급", category: "피타고라스", desc: "세 변이 직각삼각형 조건을 만족하는지 판별하세요." },
  { id: 48, title: "커트라인 정하기", difficulty: "초급", category: "정렬", desc: "k명이 합격하는 커트라인 점수를 구하세요." },
  { id: 49, title: "파스칼 피라미드", difficulty: "초급", category: "수학/피라미드", desc: "파스칼 피라미드 규칙에 따른 수열을 계산하세요." },
  { id: 50, title: "피보나치 피보나치 수열", difficulty: "초급", category: "수열/DP", desc: "피보나치 피보나치 수열의 n번째 항을 계산하세요." },

  // 51 ~ 90 (중급)
  { id: 51, title: "IoU", difficulty: "중급", category: "기하/CV", desc: "두 사각형 바운딩 박스의 교집합/합집합 비율(IoU)을 계산하세요." },
  { id: 52, title: "같은 그래프", difficulty: "중급", category: "그래프 동형", desc: "두 그래프 구조가 서로 일치하는지 판별하세요." },
  { id: 53, title: "구조 요원", difficulty: "중급", category: "BFS/최단경로", desc: "격자 지도에서 최단 시간으로 조난자를 구조하는 경로를 구하세요." },
  { id: 54, title: "그림 곱하기", difficulty: "중급", category: "행렬/확대", desc: "도트 그림을 K배 확대하여 출력하세요." },
  { id: 55, title: "그림판", difficulty: "중급", category: "DFS/플러드필", desc: "그림판 페인트 채우기(Flood Fill) 기능을 구현하세요." },
  { id: 56, title: "단어 퍼즐", difficulty: "중급", category: "백트래킹", desc: "조각들을 조합해 목표 단어를 완성하는 최소 조각 수를 구하세요." },
  { id: 57, title: "도면 훑어보기", difficulty: "중급", category: "격자 탐색", desc: "도면 격자에서 부품 위치와 개수를 스캔하세요." },
  { id: 58, title: "도어락", difficulty: "중급", category: "해시/구현", desc: "키패드 입력 시퀀스에서 유효한 비밀번호 패턴을 검증하세요." },
  { id: 59, title: "동전 줍기", difficulty: "중급", category: "DP/격자", desc: "격자를 이동하며 주울 수 있는 최대 동전 합을 구하세요." },
  { id: 60, title: "떡 하나 주면 안 잡아먹지", difficulty: "중급", category: "수학/수열", desc: "호랑이에게 주는 떡 개수 규칙을 분석해 N번째 날의 떡을 구하세요." },
  { id: 61, title: "리버스 게임", difficulty: "중급", category: "게임이론", desc: "뒤집기 게임에서 승리하기 위한 최적 수를 계산하세요." },
  { id: 62, title: "먹보 수민이", difficulty: "중급", category: "그리디/정렬", desc: "제한된 시간 내 최대 만족도를 얻는 음식 선택을 구하세요." },
  { id: 63, title: "무차별 대입 공격", difficulty: "중급", category: "브루트포스", desc: "가능한 모든 암호 조합을 시도하여 비밀번호를 해독하세요." },
  { id: 64, title: "문자열 복사", difficulty: "중급", category: "문자열/그리디", desc: "복사 및 붙여넣기 연산으로 목표 문자열을 만드는 최소 횟수를 구하세요." },
  { id: 65, title: "밑장 빼기", difficulty: "중급", category: "게임이론", desc: "카드 덱에서 밑장을 빼서 얻을 수 있는 최대 점수를 계산하세요." },
  { id: 66, title: "바닥 공사 3", difficulty: "중급", category: "DP/타일링", desc: "3xN 크기 바닥을 채우는 동적계획법 점화식을 구현하세요." },
  { id: 67, title: "별찍기", difficulty: "중급", category: "재귀/프랙탈", desc: "재귀적 프랙탈 패턴으로 별을 찍어 출력하세요." },
  { id: 68, title: "사과 게임", difficulty: "중급", category: "누적합/슬라이딩", desc: "격자에서 합이 10이 되는 연속 영역을 찾아 최대 점수를 얻으세요." },
  { id: 69, title: "사탕 꺼내기", difficulty: "중급", category: "덱/자료구조", desc: "양방향 큐에서 원하는 사탕을 꺼내는 최소 회전 수를 구하세요." },
  { id: 70, title: "선분", difficulty: "중급", category: "기하/스위핑", desc: "선분들의 교차 여부 및 겹치는 구간의 총 길이를 구하세요." },
  { id: 71, title: "순환소수", difficulty: "중급", category: "수학", desc: "분수의 순환소수 표현과 순환마디를 정확히 구하세요." },
  { id: 72, title: "숫자 맞추기", difficulty: "중급", category: "이분탐색/게임", desc: "업다운 숫자 맞추기 게임의 최소 시도 횟수를 구하세요." },
  { id: 73, title: "슬라이딩 퍼즐", difficulty: "중급", category: "BFS/상태공간", desc: "퍼즐을 목표 상태로 맞추는 최소 이동 횟수를 탐색하세요." },
  { id: 74, title: "아티스트 재승", difficulty: "중급", category: "구현/격자", desc: "예술적인 격자 도안 채색 알고리즘을 구현하세요." },
  { id: 75, title: "약육강식", difficulty: "중급", category: "시뮬레이션", desc: "생태계 먹이사슬 규칙에 따른 개체 수 변화를 시뮬레이션하세요." },
  { id: 76, title: "어묵과 파르페", difficulty: "중급", category: "배낭/DP", desc: "제한된 예산으로 얻을 수 있는 최대 맛 만족도를 구하세요." },
  { id: 77, title: "예쁜 수", difficulty: "중급", category: "수학/규칙", desc: "자릿수나 구성 조건이 아름다운 '예쁜 수'를 찾아내세요." },
  { id: 78, title: "이동하기", difficulty: "중급", category: "DP/격자경로", desc: "격자에서 오른쪽/아래로 이동하며 얻는 최대 사탕 수를 구하세요." },
  { id: 79, title: "자리 바꾸기", difficulty: "중급", category: "순열/시뮬레이션", desc: "규칙에 따라 학생들의 자리를 섞는 과정을 시뮬레이션하세요." },
  { id: 80, title: "치팅 검사", difficulty: "중급", category: "문자열 유사도", desc: "두 소스코드 간의 유사도를 측정하여 부정행위를 탐지하세요." },
  { id: 81, title: "카페 사장 철수", difficulty: "중급", category: "큐/스케줄링", desc: "카페 주문 대기열 처리 및 대기 시간 최소화 스케줄링을 구현하세요." },
  { id: 82, title: "컴퓨터 학원", difficulty: "중급", category: "탐욕법/회의실", desc: "수업 시간표가 겹치지 않게 배정할 수 있는 최대 강의 수를 구하세요." },
  { id: 83, title: "콘웨이의 생명 게임", difficulty: "중급", category: "세포자동자", desc: "콘웨이의 라이프 게임 규칙에 따라 다음 세대 상태를 갱신하세요." },
  { id: 84, title: "콩벌레", difficulty: "중급", category: "시뮬레이션", desc: "장애물을 만났을 때 웅크리거나 방향을 바꾸는 콩벌레의 이동을 추적하세요." },
  { id: 85, title: "타격왕 정우성", difficulty: "중급", category: "확률/통계", desc: "타율 계산 및 목표 타율 달성을 위한 필요 안타 수를 계산하세요." },
  { id: 86, title: "태국 택시", difficulty: "중급", category: "최단거리/다익스트라", desc: "복잡한 교통망에서 최소 비용으로 목적지에 도착하는 택시 경로를 구하세요." },
  { id: 87, title: "테트로미노", difficulty: "중급", category: "DFS/브루트포스", desc: "4칸 테트로미노 블록을 놓았을 때 얻을 수 있는 최대 수의 합을 구하세요." },
  { id: 88, title: "팰린드롬 만들기", difficulty: "중급", category: "문자열/DP", desc: "문자를 최소한으로 추가하여 팰린드롬을 만드는 길이를 구하세요." },
  { id: 89, title: "한 줄 지우기 오목", difficulty: "중급", category: "게임이론/오목", desc: "오목판에서 한 줄 지우기 특수 규칙이 적용된 승리 조건을 판별하세요." },
  { id: 90, title: "효율적인 화폐 구성", difficulty: "중급", category: "DP/동전", desc: "주어진 화폐 단위들로 특정 금액 M을 만드는 최소 동전 개수를 구하세요." },

  // 91 ~ 100 (고급)
  { id: 91, title: "교도소", difficulty: "고급", category: "BFS/비트마스크", desc: "열쇠를 획득하고 문을 열며 교도소를 탈출하는 최단 탈출 경로를 찾으세요." },
  { id: 92, title: "막사 정찰", difficulty: "고급", category: "그래프/SCC", desc: "정찰 가능한 막사 네트워크의 강결합 컴포넌트(SCC)를 분석하세요." },
  { id: 93, title: "부메랑 제작", difficulty: "고급", category: "격자 DP/백트래킹", desc: "격자판에서 부메랑 모양 블록들을 겹치지 않게 배치해 최대 점수를 얻으세요." },
  { id: 94, title: "영양 점수", difficulty: "고급", category: "조합/최적화", desc: "식단 재료들의 시너지와 영양 균형 점수를 최적화하세요." },
  { id: 95, title: "영화제", difficulty: "고급", category: "이분매칭/네트워크플로우", desc: "상영관과 영화 일정 간의 최대 관람 일정을 최적화하세요." },
  { id: 96, title: "오디세우스의 모험", difficulty: "고급", category: "최단경로/상태공간", desc: "위험 해역과 괴물을 피해 고향으로 향하는 최적 항로를 설계하세요." },
  { id: 97, title: "인간 사각형", difficulty: "고급", category: "스택/히스토그램", desc: "배열에서 만들 수 있는 가장 큰 직사각형 넓이를 O(N)으로 구하세요." },
  { id: 98, title: "조삼모사", difficulty: "고급", category: "브루트포스/조합", desc: "아침과 저녁 업무 분배에 따른 피로도 차이를 최소화하세요." },
  { id: 99, title: "친척 수", difficulty: "고급", category: "정수론/수학", desc: "약수와 배수 관계망으로 얽힌 수열에서 친척 수의 성질을 분석하세요." },
  { id: 100, title: "탈출사건", difficulty: "고급", category: "고급 그래프/플로우", desc: "추적망을 피해 미로를 탈출하는 탈출 경로의 최대 유량을 계산하세요." }
];

export function generateAll100Questions() {
  const defaultCode = `import sys 

a = int(sys.stdin.readline()) 
b = int(sys.stdin.readline())

print(a + b)
`;

  return ALL_100_REAL_QUESTIONS.map(q => ({
    ...q,
    template: defaultCode,
    testCases: [
      { input: "3\\n5", expected: "8" }
    ],
    sampleSolutions: {
      "김민희": defaultCode,
      "양소희": defaultCode,
      "정호준": defaultCode,
      "차승우": defaultCode
    }
  }));
}

if (typeof window !== 'undefined') {
  window.ALL_100_REAL_QUESTIONS = ALL_100_REAL_QUESTIONS;
  window.generateAll100Questions = generateAll100Questions;
}

