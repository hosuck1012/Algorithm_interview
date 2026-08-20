#include <limits>
#include <tuple>
#include <vector>
#include <queue>

using namespace std;

const int INF = numeric_limits<int>::max();

struct Compare
{
  bool operator()(const pair<int, int> &a, const pair<int, int> &b)
  {
    return a.first > b.first; // 거리가 작은 순서대로 정렬
  }
};

vector<int> solution(int start, int numNodes, vector<tuple<int, int, int>> edges)
{
  // 간선 정보를 활용해서 인접리스트를 생성
  vector<vector<pair<int, int>>> adjList(numNodes);
  for (const auto &[from, to, weight] : edges)
  {
    adjList[from].emplace_back(to, weight);
  }

  // 시작 노드를 제외한 모든 노드의 최소 비용을 INF로 초기화
  vector<int> distancces(numNodes, INF);
  distancces[start] = 0;

  // 우선순위 큐에 시작 노드 추가
  priority_queue<pair<int, int>, vector<pair<int, int>>, Compare> pq;
  pq.push({0, start});

  // 노드의 방문 여부를 저장하는 배열
  vector<bool> visited(numNodes, false);

  while (!pq.empty())
  {
    int currentDistance = pq.top().first;
    int currentNode = pq.top().second;
    pq.pop();

    if (visited[currentNode])
      continue;

    visited[currentNode] = true;

    // 인접 노드에 대한 거리 업데이트
    for (const auto &[neighbor, weight] : adjList[currentNode])
    {
      int newDistance = distancces[currentNode] + weight;
      if (newDistance < distancces[neighbor])
      {
        distancces[neighbor] = newDistance;
        pq.push({newDistance, neighbor});
      }
    }
  }

  return distancces;
}
