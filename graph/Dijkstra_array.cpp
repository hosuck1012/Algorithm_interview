#include <tuple>
#include <vector>
#include <algorithm>
#include <limits>

using namespace std;

const int INF = numeric_limits<int>::max();
const int MAX_NODES = 100;
int graph[MAX_NODES][MAX_NODES];
bool visited[MAX_NODES];

// 다익스트라
vector<int> solution1(int start, int numNodes, vector<tuple<int, int, int>> edges)
{

  // 그래프 및 방문 여부 초기화
  for (int i = 0; i < MAX_NODES; ++i)
  {
    fill_n(graph[i], MAX_NODES, INF);
    visited[i] = false;
  }

  // 입력받은 간선 정보를 그래프로 표현
  for (const auto &[from, to, weight] : edges)
  {
    graph[from][to] = weight;
  }

  // 시작 노드를 제외한 모든 노드의 최소 비용을 INF로 초기화
  vector<int> distances(numNodes, INF);
  distances[start] = 0;

  for (int i = 0; i < numNodes - 1; ++i)
  {
    int minDistance = INF;
    int closestNode = -1;

    // 최소거리 노드 찾기
    for (int j = 0; j < numNodes; ++j)
    {
      if (!visited[j] && distances[j] < minDistance)
      {
        minDistance = distances[j];
        closestNode = j;
      }
    }

    visited[closestNode] = true; // 찾은 노드를 방문처리

    // 인접노드에 대한 거리 업데이트
    for (int j = 0; j < numNodes; ++j)
    {
      int newDistance = distances[closestNode] + graph[closestNode][j];
      if (!visited[j] && graph[closestNode][j] != INF && newDistance < distances[j])
      {
        distances[j] = newDistance;
      }
    }
  }

  return distances;
}
