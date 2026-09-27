from PIL import Image
from collections import deque

path = r"D:\Bizora\public\Bizora_applogo.png"
img = Image.open(path).convert("RGBA")
w, h = img.size
pixels = img.load()

def is_bg(x, y):
    r, g, b, a = pixels[x, y]
    return a > 0 and r <= 25 and g <= 25 and b <= 25

visited = [[False] * h for _ in range(w)]
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if is_bg(x, y):
            q.append((x, y))
            visited[x][y] = True
for y in range(h):
    for x in (0, w - 1):
        if is_bg(x, y) and not visited[x][y]:
            q.append((x, y))
            visited[x][y] = True

cleared = 0
while q:
    x, y = q.popleft()
    pixels[x, y] = (0, 0, 0, 0)
    cleared += 1
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny] and is_bg(nx, ny):
            visited[nx][ny] = True
            q.append((nx, ny))

# Soft fringe cleanup (anti-aliased black edge)
for x in range(w):
    for y in range(h):
        r, g, b, a = pixels[x, y]
        if a and r <= 40 and g <= 40 and b <= 40:
            neighbors = 0
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if 0 <= nx < w and 0 <= ny < h and pixels[nx, ny][3] == 0:
                    neighbors += 1
            if neighbors >= 2:
                pixels[x, y] = (0, 0, 0, 0)
                cleared += 1

img.save(path, "PNG")
# also sync build icon
img.save(r"D:\Bizora\build\icon.png", "PNG")
print(f"cleared={cleared} size={w}x{h}")
