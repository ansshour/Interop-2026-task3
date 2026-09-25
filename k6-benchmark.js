import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const N = 20;
const RESULT = 6765;
const BATCHES = 100;
const REQUESTS = 100;
const PARALLEL = 10;
const warmup = __ENV.MODE === "warmup";

const targets = {
	itmo: {
		url: `https://se.ifmo.ru/~t228350/fib/?n=${N}`,
		latency: new Trend("itmo_latency", true),
	},
	yandex: {
		url: `https://d5d66jnup3jc4l3m64r8.apigw.yandexcloud.net/?n=${N}`,
		latency: new Trend("yandex_latency", true),
	},
};

export const options = warmup
	? { vus: 1, duration: "30s" }
	: {
			vus: 1,
			iterations: 1,
			summaryTrendStats: ["avg", "med", "p(95)", "p(99)", "max"],
			thresholds: {
				checks: ["rate==1"],
				http_req_failed: ["rate==0"],
			},
		};

function measure(name, batch) {
	const target = targets[name];

	for (let i = 0; i < REQUESTS; i += PARALLEL) {
		const requestsArr = Array(PARALLEL).fill({
			method: "GET",
			url: target.url,
			params: { tags: { target: name, batch } },
		});

		const responses = http.batch(requestsArr);

		for (const response of responses) {
			const body = response.json();

			check(response, {
				"correct response": () =>
					response.status === 200 && body?.n === N && body?.result === RESULT,
			});

			target.latency.add(response.timings.duration);
		}
	}
}

export default function () {
	if (warmup) {
		http.batch(Object.values(targets).map(({ url }) => url));
		sleep(1);

		return;
	}

	for (let batch = 1; batch <= BATCHES; batch++) {
		const order = batch % 2 ? ["itmo", "yandex"] : ["yandex", "itmo"];

		order.forEach((name) => measure(name, batch));
	}
}

export function handleSummary(data) {
	if (warmup) return {};

	return { "results/k6/summary.json": JSON.stringify(data, null, 2) };
}
