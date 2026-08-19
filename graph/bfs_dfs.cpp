#include <string>
#include <vector>
#include <algorithm>
#include <stack>
#include <unordered_set>
#include <unordered_map>
#include <queue>
using namespace std;

unordered_map<char, vector<char>> adjList;
vector<char> result;
unordered_set<char> visited;

// dfs(재귀)
void dfs1(char node)
{

  visited.insert(node);
  result.push_back(node);

  for (auto e : adjList[node])
  {
    if (visited.find(e) == visited.end())
    { // 방문x
      dfs1(e);
    }
  }
}

// dfs
void dfs2(char node)
{
  stack<char> st;
  st.push(node);
  visited.insert(node);

  while (!st.empty())
  {
    int flag = 0;

    for (auto e : adjList[st.top()])
    {
      if (visited.find(e) == visited.end())
      {
        st.push(e);
        visited.insert(e);
        flag = 1;
        break;
      }
    }

    if (flag == 0)
    {
      st.pop();
    }
  }
}

// bfs
void bfs(char node)
{

  queue<char> Q;
  visited.insert(node);
  Q.push(node);

  while (!Q.empty())
  {
    char cur = Q.front();
    Q.pop();

    for (auto e : adjList[cur])
    {
      if (visited.find(e) == visited.end())
      {
        visited.insert(e);
        Q.push(e);
      }
    }
  }
}
