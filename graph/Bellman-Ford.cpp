#include <limits>
#include <tuple>
#include <vector>

using namespace std;

const int INF = numeric_limits<int>::max();

vector<int> solution(int num_vertices, vector<tuple<int, int, int>> edges, int source)
{
  vector<vector<pair<int, int>>> graph(num_vertices);

  // 간선 정보를 활용해서 인접 리스트를 생성
  for (auto &edge : edges)
  {
    int from, to, weight;
    tie(from, to, weight) = edge;
    graph[from].emplace_back(to, weight);
  }

  // 현재까지 구한 최소 비용을 INF로 설정(시작 노드는 제외)
  vector<int> distance(num_vertices, INF);
  distance[source] = 0;

  // 정점의 개수 -1 만큼 최소 비용을 갱신
  for (int i = 0; i < num_vertices - 1; ++i)
  {
    for (int u = 0; u < num_vertices; ++u)
    {
      for (const auto &[v, weight] : graph[u])
      {
        if (distance[u] + weight < distance[v])
        {
          distance[v] = distance[u] + weight;
        }
      }
    }
  }

  // 음의 순환이 있는지 확인
  for (int u = 0; u < num_vertices; ++u)
  {
    for (const auto &[v, weight] : graph[u])
    {
      if (distance[u] + weight < distance[v])
      {
        return vector<int>(1, -1);
      }
    }
  }

  return distance;
}
