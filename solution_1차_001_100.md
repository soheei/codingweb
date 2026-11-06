# 코딩마스터스 1~100번 Python 3 풀이 코드

사용 방법: 해당 번호의 .py 파일 내용만 복사하여 Python 3으로 제출합니다.
외부 라이브러리는 필요하지 않습니다.

검증: 100개 파일 문법 검사, 제공 예제 200개 통과. 비교 시 출력 공백은 토큰 단위로 비교했습니다.
32번의 (공백) 표기는 실제 공백으로 해석했습니다.
questions.js와 JSON의 문제 제목 100개, 예제 200개가 모두 일치합니다.
공식 채점 서버의 숨은 테스트 및 실행 시간 제한은 확인하지 못했습니다.

원문 해석 주의사항:
- 39번: 우열을 가릴 수 없는 관계가 이어지면 같은 등수로 묶는다는 지문을 적용했습니다.
- 48번: K명 이하라는 조건 안에서 합격자 수를 우선 최대로 하고, 같으면 커트라인을 최대로 했습니다.
  모든 점수보다 높은 커트라인의 처리에는 원문이 모호합니다. 가능한 양수 합격자 수가 없으면
  원문에서 제시한 최저 점수 - 1을 출력하도록 했으며, 숨은 채점 기준은 확인 필요입니다.
- 50번: a > b일 때는 통상적인 빈 구간으로 보아 합 0을 출력합니다. 원문에는 a <= b가 명시되어 있지 않습니다.
- 97번: 실제 좌표상 넓이 d*d 대신 예제의 칸 수 기준 (d+1)*(d+1)을 적용했습니다.



## 1번 — 10배

```python
print(int(input()) * 10)
```

## 2번 — 16배 나누어 출력하기

```python
print(int(input()) // 16)
```

## 3번 — 1등급 한우

```python
n = int(input())
print('A' if n >= 200 else 'B' if n >= 180 else 'C' if n >= 150 else 'D')
```

## 4번 — 3으로 나눈 나머지

```python
print(int(input()) % 3)
```

## 5번 — 8진수와 16진수

```python
n = int(input())
print(format(n, 'o'), format(n, 'X'))
```

## 6번 — You

```python
print('Me' if input() == 'You' else 'No')
```

## 7번 — 가장 큰 나머지

```python
n = int(input())
print(max(n % 5, n % 7))
```

## 8번 — 기억상실

```python
a, b, n = map(int, input().split())
print((n - a + a - b - 1) // (a - b) + 1)
```

## 9번 — 등차수열

```python
a, b, n = map(int, input().split())
print(a + b * (n - 1))
```

## 10번 — 림보게임

```python
import sys
n, *heights = map(int, sys.stdin.buffer.read().split())
for h in heights[:n]:
    if h <= 160:
        print('I', h)
        break
else:
    print('P')
```

## 11번 — 비밀번호 찾기

```python
import sys
a = sys.stdin.read().split()
print(*a[:a.index('c') + 1])
```

## 12번 — 삼각형의 조건

```python
a = list(map(int, input().split()))
print('P' if min(a) > 0 and sum(a) == 180 else 'F')
```

## 13번 — 소수 구하기

```python
n = int(input())
p = [True] * (n + 1)
p[0] = p[1] = False
for i in range(2, int(n ** 0.5) + 1):
    if p[i]:
        for j in range(i * i, n + 1, i):
            p[j] = False
print(sum(p))
```

## 14번 — 아까운 쿠폰

```python
n = int(input())
answer = 0
for coin in (50000, 10000, 5000, 1000, 500, 100, 50, 10):
    count, n = divmod(n, coin)
    answer += count
print(answer)
```

## 15번 — 아스키 코드

```python
print(chr(int(input())))
```

## 16번 — 아이디 만들기

```python
print('P' if len(input()) <= 20 else 'I')
```

## 17번 — 우리반 아이큐왕은

```python
n = int(input())
a = [input().split() for _ in range(n)]
a.sort(key=lambda x: -int(x[1]))
print(*(x[0] for x in a[:3]), sep='\n')
```

## 18번 — 원의 넓이

```python
n = int(input()) ** 2 * 314
print(f'{n // 100}.{n % 100:02d}'.rstrip('0').rstrip('.'))
```

## 19번 — 자녀의 키는

```python
a, b = map(int, input().split())
print((a + b) // 2)
```

## 20번 — 최대공약수

```python
from math import gcd
a, b = map(int, input().split())
print(gcd(a, b))
```

## 21번 — N을 보는 시각

```python
n = input().strip()
print(sum(n in f'{h:02d}{m:02d}{s:02d}'
          for h in range(24) for m in range(60) for s in range(60)))
```

## 22번 — 가우스와 정다각형

```python
n = int(input())
while n % 2 == 0:
    n //= 2
for p in (3, 5, 17, 257, 65537):
    if n % p == 0:
        n //= p
print('YES' if n == 1 else 'NO')
```

## 23번 — 계단

```python
n, k = map(int, input().split())
d = k - n
up = (d + 2) // 3
print(up + 3 * up - d)
```

## 24번 — 구간 단속

```python
def seconds(s):
    h, m, s = map(int, s.split(':'))
    return h * 3600 + m * 60 + s

length = int(input())
n = int(input())
start = {}
for _ in range(n):
    car, t = input().split()
    start[car] = seconds(t)
result = []
for _ in range(n):
    car, t = input().split()
    result.append((car, length * 3600 // (seconds(t) - start[car])))
for car, speed in sorted(result):
    print(car, speed)
```

## 25번 — 구름 별

```python
for i in range(int(input())):
    print(' ' * i + '**')
```

## 26번 — 기둥 세우기

```python
n, m = map(int, input().split())
a = [list(map(int, input().split())) for _ in range(n)]
rows = sum(0 not in row for row in a)
cols = sum(all(a[i][j] != 0 for i in range(n)) for j in range(m))
print(max(rows, cols))
```

## 27번 — 내 이름이 적힌 번호 찾기

```python
import sys
data = sys.stdin.read().split()
print(data[2:].index(data[1]) + 1)
```

## 28번 — 누적 합

```python
import sys
data = list(map(int, sys.stdin.buffer.read().split()))
n = data[0]
size = 1
while size < n:
    size *= 2
tree = [0] * (size * 2)
tree[size:size + n] = data[1:1 + n]
for i in range(size - 1, 0, -1):
    tree[i] = tree[i * 2] + tree[i * 2 + 1]
width = 1
while width <= size:
    print(' '.join(map(str, tree[width:width * 2])) + ' ')
    width *= 2
```

## 29번 — 두더지 게임

```python
a = [input().strip() for _ in range(8)]
print(sum(a[i][j] == 'F' for i in range(8) for j in range(8) if (i + j) % 2 == 0))
```

## 30번 — 몇 번씩 나올까

```python
n = int(input())
count = [0] * 10
for x in range(1, n + 1):
    for c in str(x):
        count[int(c)] += 1
print(*count)
```

## 31번 — 무향 그래프 1

```python
import sys
it = iter(map(int, sys.stdin.buffer.read().split()))
n, m = next(it), next(it)
a = [[0] * n for _ in range(n)]
for _ in range(m):
    u, v = next(it) - 1, next(it) - 1
    a[u][v] = a[v][u] = 1
for row in a:
    print(' '.join(map(str, row)) + ' ')
```

## 32번 — 문서 통계

```python
s = input()
print(len(s))
print(len(s.replace(' ', '')))
print(len(s.split()))
```

## 33번 — 바닥 공사 1

```python
n = int(input())
a, b = 1, 1
for _ in range(n):
    a, b = b, (a + b) % 796796
print(a)
```

## 34번 — 배수 만들기

```python
import sys
n, *a = map(int, sys.stdin.buffer.read().split())
if not any(a):
    print(0)
elif a.count(0) < 2 or sum(a) % 3:
    print(-1)
else:
    print(''.join(map(str, sorted(a, reverse=True))))
```

## 35번 — 분리수거장

```python
n = int(input())
a = [tuple(map(int, input().split())) for _ in range(n)]
print(min(range(n), key=lambda i: sum(abs(a[i][0] - d) * people for d, people in a)) + 1)
```

## 36번 — 분수를 소수로

```python
import sys
p, q, n = map(int, sys.stdin.buffer.read().split())
digits = []
for _ in range(n):
    d, p = divmod(p * 10, q)
    digits.append(d)
carry = int(p * 10 // q >= 5)
for i in range(n - 1, -1, -1):
    carry, digits[i] = divmod(digits[i] + carry, 10)
print(str(carry) + '.' + ''.join(map(str, digits)))
```

## 37번 — 사전 만들기

```python
n = int(input())
words = {input().strip() for _ in range(n)}
print(*sorted(words, key=lambda s: (len(s), s)), sep='\n')
```

## 38번 — 설거지 담당

```python
print('RUN' if int(input()) % 2 else 'STAY')
```

## 39번 — 신입사원 채용

```python
n = int(input())
a = [tuple(map(int, input().split())) for _ in range(n)]
parent = list(range(n))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
for i in range(n):
    for j in range(i):
        x, y = a[i]
        u, v = a[j]
        if (x - u) * (y - v) < 0 or (x == u and y == v):
            parent[find(i)] = find(j)
groups = {}
for i in range(n):
    groups.setdefault(find(i), []).append(i)
ordered = sorted(groups.values(), key=lambda g: max(a[i] for i in g), reverse=True)
answer = [0] * n
rank = 1
for group in ordered:
    for i in group:
        answer[i] = rank
    rank += len(group)
print(*answer)
```

## 40번 — 예비군 훈련

```python
year, army, mobilized, status = input().split()
year = int(year)
if year == 0:
    print(0)
elif status == 'Officer':
    print(28)
elif year >= 5:
    print(20)
elif mobilized == 'Y' or army == 'ROKAF':
    print(28)
else:
    print(32)
```

## 41번 — 오리 농법

```python
n = int(input())
a = [list(map(int, input().split())) for _ in range(n)]
rows = [1 in row for row in a]
cols = [any(a[i][j] == 1 for i in range(n)) for j in range(n)]
print(sum(a[i][j] == 2 and rows[i] and cols[j] for i in range(n) for j in range(n)))
```

## 42번 — 이별 30분 전

```python
h, m = map(int, input().split())
t = (h * 60 + m - 30) % 1440
print(t // 60, t % 60)
```

## 43번 — 정렬된 많은 원소 사이에서 특정 원소 찾기

```python
import sys
from bisect import bisect_left
it = iter(map(int, sys.stdin.buffer.read().split()))
n, target = next(it), next(it)
a = list(it)
i = bisect_left(a, target)
print(i + 1 if i < n and a[i] == target else -1)
```

## 44번 — 조합

```python
from math import comb
a, b = map(int, input().split())
print(comb(a, b))
```

## 45번 — 주사위의 합

```python
n = int(input())
for a in range(1, 7):
    if 1 <= n - a <= 6:
        print(a, n - a)
```

## 46번 — 중앙 값

```python
print(sorted(map(int, input().split()))[2])
```

## 47번 — 직각 삼각형

```python
a, b, c = sorted(map(int, input().split()))
print('YES' if a * a + b * b == c * c else 'NO')
```

## 48번 — 커트라인 정하기

```python
n, k = map(int, input().split())
a = list(map(int, input().split()))
best_count, answer = -1, min(a) - 1
for p in range(min(a), max(a) + 1):
    passed = [x >= p for x in a]
    count = sum(passed[i] or (i > 0 and passed[i - 1]) or
                (i + 1 < n and passed[i + 1]) for i in range(n))
    if count <= k and count >= best_count:
        best_count, answer = count, p
print(answer)
```

## 49번 — 파스칼 피라미드

```python
from math import factorial
n = int(input()) - 1
for i in range(n + 1):
    row = [factorial(n) // (factorial(i) * factorial(j) * factorial(n - i - j))
           for j in range(n - i + 1)]
    print(' '.join(map(str, row)) + ' ')
```

## 50번 — 피보나치 피보나치 수열

```python
a, b = map(int, input().split())
s = []
x, y = 1, 1
while len(s) < max(a, b):
    s.extend([x] * x)
    x, y = y, x + y
print(sum(s[a - 1:b]))
```

## 51번 — IoU

```python
n = int(input())
a = [tuple(map(int, input().split())) for _ in range(n)]
best_num, best_den = -1, 1
answer = (1, 2)
for i in range(n):
    x, y, w, h = a[i]
    for j in range(i + 1, n):
        u, v, z, t = a[j]
        intersection = max(0, min(x + w, u + z) - max(x, u)) * max(0, min(y + h, v + t) - max(y, v))
        union = w * h + z * t - intersection
        if intersection * best_den > best_num * union:
            best_num, best_den = intersection, union
            answer = (i + 1, j + 1)
print(*answer)
```

## 52번 — 같은 그래프

```python
from itertools import permutations
def read_graph():
    n, m = map(int, input().split())
    edges = set()
    for _ in range(m):
        u, v = map(int, input().split())
        edges.add(tuple(sorted((u - 1, v - 1))))
    return n, edges
n, a = read_graph()
m, b = read_graph()
answer = False
if n == m and len(a) == len(b):
    for p in permutations(range(n)):
        if {tuple(sorted((p[u], p[v]))) for u, v in a} == b:
            answer = True
            break
print('YES' if answer else 'NO')
```

## 53번 — 구조 요원

```python
from math import hypot
n = int(input())
x, y = map(int, input().split())
print(min(range(min(0, x), max(0, x) + 1), key=lambda t: hypot(t, n) / 10 + hypot(x - t, y) / 5))
```

## 54번 — 그림 곱하기

```python
from math import gcd
n, m = map(int, input().split())
a = [input().strip() for _ in range(n)]
for k in range(gcd(n, m), 0, -1):
    if n % k or m % k:
        continue
    h, w = n // k, m // k
    if all(a[i][j] == a[i % h][j % w] for i in range(n) for j in range(m)):
        print(*(row[:w] for row in a[:h]), sep='\n')
        break
```

## 55번 — 그림판

```python
n, m = map(int, input().split())
a = [list(input().strip()) for _ in range(n)]
red = blue = 0
for i in range(n):
    for j in range(m):
        if a[i][j] == 'X':
            continue
        stack = [(i, j)]
        r = int(a[i][j] == 'A')
        b = int(a[i][j] == 'B')
        a[i][j] = 'X'
        while stack:
            x, y = stack.pop()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                u, v = x + dx, y + dy
                if 0 <= u < n and 0 <= v < m and a[u][v] != 'X':
                    r += a[u][v] == 'A'
                    b += a[u][v] == 'B'
                    a[u][v] = 'X'
                    stack.append((u, v))
        if r > b:
            red += r
        else:
            blue += b
print(red, blue)
```

## 56번 — 단어 퍼즐

```python
import sys
from itertools import permutations
from collections import Counter
words = sys.stdin.read().split()
all_words = Counter(words)
for rows in sorted(set(permutations(words, 3))):
    cols = [''.join(rows[i][j] for i in range(3)) for j in range(3)]
    if Counter(rows + tuple(cols)) == all_words:
        print(*rows, sep='\n')
        break
```

## 57번 — 도면 훑어보기

```python
t = int(input())
for _ in range(t):
    a = [input().strip() for _ in range(10)]
    seen = set()
    floor_groups = 0
    enclosed = False
    for i in range(10):
        for j in range(20):
            if (i, j) in seen:
                continue
            ch = a[i][j]
            stack = [(i, j)]
            seen.add((i, j))
            size, border = 0, False
            while stack:
                x, y = stack.pop()
                size += 1
                border |= x in (0, 9) or y in (0, 19)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    u, v = x + dx, y + dy
                    if 0 <= u < 10 and 0 <= v < 20 and (u, v) not in seen and a[u][v] == ch:
                        seen.add((u, v))
                        stack.append((u, v))
            if ch == '.':
                floor_groups += 1
            elif size >= 6 and not border:
                enclosed = True
    print(int(floor_groups == 1) + 2 * int(enclosed))
```

## 58번 — 도어락

```python
import sys
data = list(map(int, sys.stdin.buffer.read().split()))
n, times = data[0], data[1:]
cost = [[1 if i == j else 2 if max(abs(i // 3 - j // 3), abs(i % 3 - j % 3)) == 1 else 3
         for j in range(9)] for i in range(9)]
dp = [1] * 9
for t in times[:n - 1]:
    dp = [sum(dp[i] for i in range(9) if cost[i][j] == t) % 1000000007 for j in range(9)]
print(sum(dp) % 1000000007)
```

## 59번 — 동전 줍기

```python
n = int(input())
dp = [int(input())]
for i in range(1, n):
    row = list(map(int, input().split()))
    dp = [row[j] + max(dp[j - 1] if j > 0 else 0, dp[j] if j < i else 0) for j in range(i + 1)]
print(max(dp))
```

## 60번 — 떡 하나 주면 안 잡아먹지

```python
from heapq import heappush, heappop
n = int(input())
a = [list(map(int, input().split())) for _ in range(n)]
dist = [[float('inf')] * n for _ in range(n)]
dist[0][0] = a[0][0]
heap = [(a[0][0], 0, 0)]
while heap:
    d, x, y = heappop(heap)
    if d != dist[x][y]:
        continue
    if (x, y) == (n - 1, n - 1):
        print(d)
        break
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        u, v = x + dx, y + dy
        if 0 <= u < n and 0 <= v < n and d + a[u][v] < dist[u][v]:
            dist[u][v] = d + a[u][v]
            heappush(heap, (dist[u][v], u, v))
```

## 61번 — 리버스 게임

```python
n = int(input())
a = [input().strip() for _ in range(n)]
columns = [sum((a[i][j] == 'W') << i for i in range(n)) for j in range(n)]
answer = n * n
for mask in range(1 << n):
    total = 0
    for col in columns:
        white = bin(col ^ mask).count('1')
        total += min(white, n - white)
    answer = min(answer, total)
print(answer)
```

## 62번 — 먹보 수민이

```python
from heapq import heappush, heappop
n = int(input())
stores = sorted(tuple(map(int, input().split())) for _ in range(n))
goal, reach = map(int, input().split())
heap = []
i = count = 0
while reach < goal:
    while i < n and stores[i][0] <= reach:
        heappush(heap, -stores[i][1])
        i += 1
    if not heap:
        count = -1
        break
    reach -= heappop(heap)
    count += 1
print(count)
```

## 63번 — 무차별 대입 공격

```python
from itertools import product
n, k = map(int, input().split())
letters = sorted(input().strip())
for word in product(letters, repeat=k):
    print(''.join(word))
```

## 64번 — 문자열 복사

```python
from itertools import groupby
from functools import lru_cache
def runs(s):
    return [(c, len(list(g))) for c, g in groupby(s)]
original = runs(input().strip())
target = runs(input().strip())
base = tuple(count for _, count in original)
goal = tuple(count for _, count in target)
k = len(base)
@lru_cache(None)
def solve(state):
    if state == base:
        return 0
    best = 100
    for i in range(k):
        for j in range(i, k):
            mid = list(state)
            valid = True
            for t in range(i + 1, j):
                if state[t] % 2 or state[t] // 2 < base[t]:
                    valid = False
                    break
                mid[t] //= 2
            if not valid:
                continue
            for left in range(max(base[i], (state[i] + 1) // 2), state[i]):
                mid[i] = left
                if i == j:
                    best = min(best, 1 + solve(tuple(mid)))
                else:
                    for right in range(max(base[j], (state[j] + 1) // 2), state[j]):
                        mid[j] = right
                        best = min(best, 1 + solve(tuple(mid)))
    return best
print(solve(goal))
```

## 65번 — 밑장 빼기

```python
from collections import deque
import sys
n, *a = map(int, sys.stdin.buffer.read().split())
q = deque(a)
for x in range(1, n + 1):
    if q[0] == x:
        q.popleft()
    elif q[-1] == x:
        q.pop()
    else:
        print('NO')
        break
else:
    print('YES')
```

## 66번 — 바닥 공사 3

```python
n = int(input())
dp = [0] * (n + 1)
dp[0] = 1
if n >= 2:
    dp[2] = 3
for i in range(4, n + 1, 2):
    dp[i] = 4 * dp[i - 2] - dp[i - 4]
print(dp[n])
```

## 67번 — 별찍기

```python
n = int(input())
pattern = ['*']
for _ in range(n - 1):
    size = len(pattern)
    blank = ' ' * size
    pattern = ([line + blank + line for line in pattern] +
               [blank + line + blank for line in pattern] +
               [line + blank + line for line in pattern])
for line in pattern:
    print(line.rstrip())
```

## 68번 — 사과 게임

```python
n, m = map(int, input().split())
a = [list(map(int, input().split())) for _ in range(n)]
answer = 0
for top in range(n):
    sums = [0] * m
    for bottom in range(top, n):
        for j in range(m):
            sums[j] += a[bottom][j]
        for left in range(m):
            total = 0
            for right in range(left, m):
                total += sums[right]
                answer += total == 10
                if total >= 10:
                    break
print(answer)
```

## 69번 — 사탕 꺼내기

```python
from collections import deque
import sys
it = iter(map(int, sys.stdin.buffer.read().split()))
n, m = next(it), next(it)
q = deque(range(1, n + 1))
answer = 0
for _ in range(m):
    x = next(it)
    i = q.index(x)
    answer += min(i, len(q) - i)
    q.rotate(-i)
    q.popleft()
print(answer)
```

## 70번 — 선분

```python
print(2 * int(input()) - 3)
```

## 71번 — 순환소수

```python
p, q = map(int, input().split())
seen = {}
digits = []
while p and p not in seen:
    seen[p] = len(digits)
    d, p = divmod(p * 10, q)
    digits.append(str(d))
if p:
    i = seen[p]
    print('0.' + ''.join(digits[:i]) + '{' + ''.join(digits[i:]) + '}')
else:
    print('0.' + ''.join(digits))
```

## 72번 — 숫자 맞추기

```python
from collections import deque
target, start = map(int, input().split())
limit = 2 * max(target, start) + 2
dist = [-1] * (limit + 1)
dist[start] = 0
q = deque([start])
while q:
    x = q.popleft()
    if x == target:
        print(dist[x])
        break
    for y in (x - 1, x + 1, x * 2):
        if 0 <= y <= limit and dist[y] == -1:
            dist[y] = dist[x] + 1
            q.append(y)
```

## 73번 — 슬라이딩 퍼즐

```python
from collections import deque
s = input().strip() + input().strip()
q = deque([s])
dist = {s: 0}
adj = ((1, 2), (0, 3), (0, 3), (1, 2))
while q:
    state = q.popleft()
    if state == '123X':
        print(dist[state])
        break
    i = state.index('X')
    for j in adj[i]:
        a = list(state)
        a[i], a[j] = a[j], a[i]
        new = ''.join(a)
        if new not in dist:
            dist[new] = dist[state] + 1
            q.append(new)
else:
    print(-1)
```

## 74번 — 아티스트 재승

```python
s = input().strip()
n, m = map(int, input().split())
a = [input().strip() for _ in range(n)]
def dfs(x, y, i, used):
    if i == len(s) - 1:
        return True
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        u, v = x + dx, y + dy
        bit = 1 << (u * m + v) if 0 <= u < n and 0 <= v < m else 0
        if bit and not used & bit and a[u][v] == s[i + 1]:
            if dfs(u, v, i + 1, used | bit):
                return True
    return False
answer = 0
if sum(c != '.' for row in a for c in row) == len(s):
    for i in range(n):
        for j in range(m):
            if a[i][j] == s[0] and dfs(i, j, 0, 1 << (i * m + j)):
                answer += 1
print(answer)
```

## 75번 — 약육강식

```python
from bisect import bisect_left
import sys
n, *a = map(int, sys.stdin.buffer.read().split())
tails = []
for x in a[:n]:
    i = bisect_left(tails, x)
    if i == len(tails):
        tails.append(x)
    else:
        tails[i] = x
print(len(tails))
```

## 76번 — 어묵과 파르페

```python
s = input().strip()
longest = max(map(len, s.split('F')))
print(s.count('P') - longest)
```

## 77번 — 예쁜 수

```python
s = input().strip()
n = int(s)
answer = any(n % int(s[i:j]) == 0 for i in range(len(s)) for j in range(i + 1, len(s) + 1)
             if j - i < len(s))
print('YES' if answer else 'NO')
```

## 78번 — 이동하기

```python
n = int(input())
x, y = map(int, input().split())
tx, ty = map(int, input().split())
seen = {(x, y)}
def dfs(x, y, remain):
    d = abs(x - tx) + abs(y - ty)
    if d > remain or (remain - d) % 2:
        return 0
    if remain == 0:
        return int((x, y) == (tx, ty))
    if (x, y) == (tx, ty):
        return 0
    answer = 0
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        p = (x + dx, y + dy)
        if p not in seen:
            seen.add(p)
            answer += dfs(*p, remain - 1)
            seen.remove(p)
    return answer
print(dfs(x, y, n))
```

## 79번 — 자리 바꾸기

```python
from functools import lru_cache
n = int(input()) * 2
k = int(input())
score = [[0] * n for _ in range(n)]
for _ in range(k):
    relation, a, b = map(int, input().split())
    score[a - 1][b - 1] = score[b - 1][a - 1] = 1 if relation == 1 else -1
@lru_cache(None)
def solve(mask):
    if not mask:
        return 0
    first = (mask & -mask).bit_length() - 1
    rest = mask ^ (1 << first)
    return max(score[first][j] + solve(rest ^ (1 << j)) for j in range(n) if rest >> j & 1)
print(solve((1 << n) - 1))
```

## 80번 — 치팅 검사

```python
s = input().strip()
for i in range(1, len(s) // 2):
    split = i * 2
    right_len = (len(s) - split) // 2
    if s[:i] == s[i:split] and s[split:split + right_len] == s[split + right_len:]:
        print('YES')
        print(s[:i] + s[split:split + right_len])
        break
else:
    print('NO')
```

## 81번 — 카페 사장 철수

```python
from heapq import heappush, heappop
n, m = map(int, input().split())
visits = sorted(tuple(input().split()) for _ in range(m))
heap = []
answer = 0
for start, end in visits:
    while heap and heap[0] <= start:
        heappop(heap)
    if len(heap) < n:
        heappush(heap, end)
        answer += 1
print(answer)
```

## 82번 — 컴퓨터 학원

```python
n = int(input())
empty, top, bottom = 1, 0, 0
for _ in range(n):
    empty, top, bottom = ((empty + top + bottom) % 796796,
                          (empty + bottom) % 796796, (empty + top) % 796796)
print((empty + top + bottom) % 796796)
```

## 83번 — 콘웨이의 생명 게임

```python
n = int(input())
a = [list(map(int, input().strip())) for _ in range(5)]
for _ in range(n):
    b = [[0] * 5 for _ in range(5)]
    for i in range(5):
        for j in range(5):
            count = sum(a[x][y] for x in range(max(0, i - 1), min(5, i + 2))
                        for y in range(max(0, j - 1), min(5, j + 2)) if (x, y) != (i, j))
            b[i][j] = int(count == 3 or (a[i][j] == 1 and count == 2))
    a = b
for row in a:
    print(''.join(map(str, row)))
```

## 84번 — 콩벌레

```python
a = [input().strip() for _ in range(10)]
x, y = next((i, j) for i in range(10) for j in range(10) if a[i][j] == '2')
directions = ((-1, 0), (0, 1), (1, 0), (0, -1))
d, turn = 0, -1
seen = set()
while (x, y, d, turn) not in seen:
    seen.add((x, y, d, turn))
    dx, dy = directions[d]
    u, v = x + dx, y + dy
    if not (0 <= u < 10 and 0 <= v < 10):
        print('yes')
        break
    if a[u][v] == '1':
        d = (d + turn) % 4
        turn = -turn
    else:
        x, y = u, v
else:
    print('no')
```

## 85번 — 타격왕 정우성

```python
x, y = map(int, input().split())
z = 100 * y // x
if z >= 99:
    print(-1)
else:
    denominator = 99 - z
    answer = ((z + 1) * x - 100 * y + denominator - 1) // denominator
    print(answer if answer <= 1000000000 else -1)
```

## 86번 — 태국 택시

```python
n, m = map(int, input().split())
edges = []
for _ in range(m):
    a, b, c = map(int, input().split())
    edges.append((c, a - 1, b - 1))
parent = list(range(n))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]
        x = parent[x]
    return x
answer = 0
for cost, a, b in sorted(edges):
    a, b = find(a), find(b)
    if a != b:
        parent[a] = b
        answer += cost
print(answer)
```

## 87번 — 테트로미노

```python
a = [input().strip() for _ in range(5)]
cells = {(i, j) for i in range(5) for j in range(5) if a[i][j] == '#'}
seen = set()
if cells:
    stack = [next(iter(cells))]
    seen.add(stack[0])
    while stack:
        x, y = stack.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p = (x + dx, y + dy)
            if p in cells and p not in seen:
                seen.add(p)
                stack.append(p)
print('YES' if len(cells) == len(seen) == 4 else 'NO')
```

## 88번 — 팰린드롬 만들기

```python
from itertools import permutations
n = int(input())
words = [input().strip() for _ in range(n)]
for p in permutations(words):
    s = ''.join(p)
    if s == s[::-1]:
        print('YES')
        break
else:
    print('NO')
```

## 89번 — 한 줄 지우기 오목

```python
a = [list(input().strip()) for _ in range(10)]
def wins(x, y):
    for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
        count = 1
        for sign in (1, -1):
            u, v = x + sign * dx, y + sign * dy
            while 0 <= u < 10 and 0 <= v < 10 and a[u][v] == 'W':
                count += 1
                u += sign * dx
                v += sign * dy
        if count >= 5:
            return True
    return False
answer = 0
for axis in range(2):
    for line in range(10):
        cells = [(line, j) for j in range(10)] if axis == 0 else [(i, line) for i in range(10)]
        saved = [a[i][j] for i, j in cells]
        for i, j in cells:
            a[i][j] = '.'
        for i in range(10):
            for j in range(10):
                if a[i][j] == '.':
                    answer += wins(i, j)
        for (i, j), value in zip(cells, saved):
            a[i][j] = value
print(answer)
```

## 90번 — 효율적인 화폐 구성

```python
import sys
data = list(map(int, sys.stdin.buffer.read().split()))
n, target = data[:2]
dp = [target + 1] * (target + 1)
dp[0] = 0
for coin in data[2:2 + n]:
    for total in range(coin, target + 1):
        dp[total] = min(dp[total], dp[total - coin] + 1)
print(dp[target] if dp[target] <= target else -1)
```

## 91번 — 교도소

```python
from collections import deque
n, m = map(int, input().split())
graph = [[] for _ in range(n)]
for _ in range(m):
    u, v = map(int, input().split())
    graph[u - 1].append(v - 1)
    graph[v - 1].append(u - 1)
color = [-1] * n
valid = True
for start in range(n):
    if color[start] != -1:
        continue
    color[start] = 0
    q = deque([start])
    while q:
        u = q.popleft()
        for v in graph[u]:
            if color[v] == -1:
                color[v] = color[u] ^ 1
                q.append(v)
            elif color[v] == color[u]:
                valid = False
print(int(valid))
```

## 92번 — 막사 정찰

```python
from collections import deque
n, p = map(int, input().split())
size = n * 2
capacity = [[0] * size for _ in range(size)]
adj = [[] for _ in range(size)]
def add(u, v, c):
    if v not in adj[u]:
        adj[u].append(v)
        adj[v].append(u)
    capacity[u][v] += c
for i in range(n):
    add(i * 2, i * 2 + 1, 1000 if i < 2 else 1)
for _ in range(p):
    a, b = map(int, input().split())
    a -= 1
    b -= 1
    add(a * 2 + 1, b * 2, 1000)
    add(b * 2 + 1, a * 2, 1000)
source, sink = 1, 2
answer = 0
while True:
    parent = [-1] * size
    parent[source] = source
    q = deque([source])
    while q and parent[sink] == -1:
        u = q.popleft()
        for v in adj[u]:
            if parent[v] == -1 and capacity[u][v] > 0:
                parent[v] = u
                q.append(v)
    if parent[sink] == -1:
        break
    v = sink
    while v != source:
        u = parent[v]
        capacity[u][v] -= 1
        capacity[v][u] += 1
        v = u
    answer += 1
print(answer)
```

## 93번 — 부메랑 제작

```python
n, m = map(int, input().split())
a = [list(map(int, input().split())) for _ in range(n)]
options = [[] for _ in range(n * m)]
for i in range(n):
    for j in range(m):
        center = i * m + j
        for dx in (-1, 1):
            for dy in (-1, 1):
                x, y = i + dx, j + dy
                if 0 <= x < n and 0 <= y < m:
                    mask = (1 << center) | (1 << (x * m + j)) | (1 << (i * m + y))
                    value = 2 * a[i][j] + a[x][j] + a[i][y]
                    options[center].append((mask, value))
answer = 0
def dfs(pos, used, score):
    global answer
    if pos == n * m:
        answer = max(answer, score)
        return
    if not (used >> pos & 1):
        for mask, value in options[pos]:
            if not used & mask:
                dfs(pos + 1, used | mask, score + value)
    dfs(pos + 1, used, score)
dfs(0, 0, 0)
print(answer)
```

## 94번 — 영양 점수

```python
from itertools import combinations
n = int(input())
a = [list(map(int, input().split())) for _ in range(n)]
weights = [sum(a[i]) + sum(a[j][i] for j in range(n)) for i in range(n)]
total = sum(weights) // 2
answer = min(abs(weights[0] + sum(weights[i] for i in group) - total)
             for group in combinations(range(1, n), n // 2 - 1))
print(answer)
```

## 95번 — 영화제

```python
n = int(input())
a = [tuple(map(int, input().split())) for _ in range(n)]
graph = [[] for _ in range(n)]
for i in range(n):
    for j in range(n):
        if i == j or (a[i] == a[j] and i > j):
            continue
        if all(x >= y for x, y in zip(a[i], a[j])):
            graph[i].append(j)
match = [-1] * n
def augment(u, seen):
    for v in graph[u]:
        if seen[v]:
            continue
        seen[v] = True
        if match[v] == -1 or augment(match[v], seen):
            match[v] = u
            return True
    return False
removed = 0
for i in range(n):
    for _ in range(2):
        removed += augment(i, [False] * n)
print(n - removed)
```

## 96번 — 오디세우스의 모험

```python
from heapq import heappush, heappop
n, m = map(int, input().split())
graph = [[] for _ in range(n)]
for _ in range(m):
    a, b, c = map(int, input().split())
    graph[a - 1].append((b - 1, c))
    graph[b - 1].append((a - 1, c))
start, goal = map(int, input().split())
start -= 1
goal -= 1
best = [0] * n
best[start] = 101
heap = [(-101, start)]
while heap:
    neg, u = heappop(heap)
    value = -neg
    if value != best[u]:
        continue
    if u == goal:
        print(value)
        break
    for v, limit in graph[u]:
        candidate = min(value, limit)
        if candidate > best[v]:
            best[v] = candidate
            heappush(heap, (-candidate, v))
```

## 97번 — 인간 사각형

```python
n, m = map(int, input().split())
a = [list(map(int, input().split())) for _ in range(n)]
answer = 0
for d in range(min(n, m) - 1, 0, -1):
    if any(a[i][j] == a[i + d][j] == a[i][j + d] == a[i + d][j + d]
           for i in range(n - d) for j in range(m - d)):
        answer = (d + 1) ** 2
        break
print(answer)
```

## 98번 — 조삼모사

```python
n = int(input())
a = list(map(int, input().split()))
budget = int(input())
lo, hi = 0, max(a)
while lo < hi:
    mid = (lo + hi + 1) // 2
    if sum(min(x, mid) for x in a) <= budget:
        lo = mid
    else:
        hi = mid - 1
print(lo)
```

## 99번 — 친척 수

```python
from math import gcd, isqrt
n = int(input())
a = [int(input()) for _ in range(n)]
g = 0
for x in a[1:]:
    g = gcd(g, abs(x - a[0]))
answer = set()
for d in range(1, isqrt(g) + 1):
    if g % d == 0:
        answer.add(d)
        answer.add(g // d)
print(*sorted(answer))
```

## 100번 — 탈출사건

```python
from itertools import combinations
n, m = map(int, input().split())
a = [list(map(int, input().split())) for _ in range(n)]
empty = 0
infected = 0
for i in range(n):
    for j in range(m):
        bit = 1 << (i * m + j)
        if a[i][j] == 0:
            empty |= bit
        elif a[i][j] == 2:
            infected |= bit
cells = [1 << i for i in range(n * m) if empty >> i & 1]
left = sum(1 << (i * m) for i in range(n))
right = left << (m - 1)
answer = 0
for x, y, z in combinations(cells, 3):
    available = empty ^ (x | y | z)
    spread = infected
    while True:
        neighbors = ((spread & ~left) >> 1) | ((spread & ~right) << 1) | (spread >> m) | (spread << m)
        new = spread | (neighbors & available)
        if new == spread:
            break
        spread = new
    safe = bin(available & ~spread).count('1')
    answer = max(answer, safe)
print(answer)
```
