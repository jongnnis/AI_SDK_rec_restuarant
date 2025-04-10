import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai('gpt-4o'),
    system: "너는 사용자의 맛집 검색 요청시, 맛집을 추천해주는 AI야. 맛집을 검색할 때는 네이버 지도 api를 사용해. 원하는 지역의 맛집을 검색 후, 여러 음식점 후보들 중 가장 가까운 음식점을 최종으로 추천해줘. 사용자의 현재 위치랑 관계없이 검색한 장소와 가장 가까운 음식점 소개해주면 돼.",
    messages,
    tools: {
      getRestaurant: {
        description: '네이버 지도 api를 사용하여 원하는 지역의 맛집을 검색합니다.',
        parameters: z.object({
          location: z.string().describe('검색할 지역명, 예: 홍대, 강남'),
        }),
        execute: async ({location}) => {
          const query = `${location} 맛집`;
          const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=10&sort=comment`, {
            headers: {
              'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID || '',
              'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET || '',
            },
          });
          const data = await response.json();
          console.log(data);
          return data.items;
        }
      },
      findClosestRestaurant: {
        description: '사용자의 위치에서 가장 가까운 음식점을 찾습니다.',
        parameters: z.object({
          userLat: z.number().describe('검색한 장소명의 위도 (예: 37.5745)'),
          userLng: z.number().describe('검색한 장소명의 경도 (예: 126.9849)'),
          restaurants: z.array(
            z.object({
              title: z.string(),
              mapx: z.string(),
              mapy: z.string(),
              roadAddress: z.string(),
              link: z.string(),
            })
          ).describe('getRestaurant 툴에서 반환된 음식점 리스트')
        }),
        execute: async ({ userLat, userLng, restaurants }) => {
          // Haversine 거리 계산 함수
          const deg2rad = (deg: number) => deg * (Math.PI / 180);
          const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
            const R = 6371; // 지구 반지름 (단위: km)
            const dLat = deg2rad(lat2 - lat1);
            const dLon = deg2rad(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 +
                      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
                      Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
          };
      
          let closest = null;
          let minDistance = Infinity;
      
          for (const restaurant of restaurants) {
            const lat = parseFloat(restaurant.mapy) / 1e7;
            const lng = parseFloat(restaurant.mapx) / 1e7;
            const distance = getDistance(userLat, userLng, lat, lng);
      
            if (distance < minDistance) {
              minDistance = distance;
              closest = { ...restaurant, distance };
            }
          }
      
          return {
            closest,
            message: `가장 가까운 음식점은 '${closest?.title}'입니다. 약 ${closest?.distance.toFixed(2)}km 떨어져 있어요.`,
          };
        }
      },
      getCoordinatesFromQuery: {
        description: '장소명 또는 주소를 입력하면 해당 위치의 위도와 경도를 반환합니다.',
        parameters: z.object({
          query: z.string().describe('장소명 또는 주소 (예: 안국역, 서울특별시 종로구 등)'),
        }),
        execute: async ({ query }) => {
          const response = await fetch(`https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=1`, {
            headers: {
              'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID || '',
              'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET || '',
            },
          });
      
          const data = await response.json();
      
          if (!data.items || data.items.length === 0) {
            return { error: `'${query}'에 대한 좌표를 찾을 수 없습니다.` };
          }
      
          const item = data.items[0];
          const lat = parseFloat(item.mapy) / 1e7;
          const lng = parseFloat(item.mapx) / 1e7;
      
          return {
            title: item.title,
            address: item.roadAddress || item.address,
            lat,
            lng,
            message: `'${item.title}'의 좌표는 위도 ${lat}, 경도 ${lng}입니다.`,
          };
        }
      },      
    },
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
