import { computePoolAddress, Pool } from '@uniswap/v3-sdk';
import retry from 'async-retry';
import _ from 'lodash';
import { IUniswapV3PoolState__factory } from '../../types/v3/factories/IUniswapV3PoolState__factory';
import { V3_CORE_FACTORY_ADDRESSES } from '../../util/addresses';
import { log } from '../../util/log';
import { poolToString } from '../../util/routes';
export class V3PoolProvider {
    /**
     * Creates an instance of V3PoolProvider.
     * @param chainId The chain id to use.
     * @param multicall2Provider The multicall provider to use to get the pools.
     * @param retryOptions The retry options for each call to the multicall.
     */
    constructor(chainId, multicall2Provider, retryOptions = {
        retries: 2,
        minTimeout: 50,
        maxTimeout: 500,
    }) {
        this.chainId = chainId;
        this.multicall2Provider = multicall2Provider;
        this.retryOptions = retryOptions;
        // Computing pool addresses is slow as it requires hashing, encoding etc.
        // Addresses never change so can always be cached.
        this.POOL_ADDRESS_CACHE = {};
    }
    async getPools(tokenPairs, providerConfig) {
        const poolAddressSet = new Set();
        const sortedTokenPairs = [];
        const sortedPoolAddresses = [];
        console.log("FunctionGetPools", tokenPairs);
        for (const tokenPair of tokenPairs) {
            const [tokenA, tokenB, feeAmount] = tokenPair;
            const { poolAddress, token0, token1 } = this.getPoolAddress(tokenA, tokenB, feeAmount);
            console.log("FunctionGetPools", { poolAddress, token0, token1 });
            if (poolAddressSet.has(poolAddress)) {
                continue;
            }
            poolAddressSet.add(poolAddress);
            sortedTokenPairs.push([token0, token1, feeAmount]);
            sortedPoolAddresses.push(poolAddress);
        }
        console.log("FunctionGetPools", { poolAddressSet, sortedTokenPairs, sortedPoolAddresses });
        log.debug(`getPools called with ${tokenPairs.length} token pairs. Deduped down to ${poolAddressSet.size}`);
        const [slot0Results, liquidityResults] = await Promise.all([
            this.getPoolsData(sortedPoolAddresses, 'slot0', providerConfig),
            this.getPoolsData(sortedPoolAddresses, 'liquidity', providerConfig),
        ]);
        console.log("FunctionGetPools", { slot0Results, liquidityResults });
        log.info(`Got liquidity and slot0s for ${poolAddressSet.size} pools ${(providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber)
            ? `as of block: ${providerConfig === null || providerConfig === void 0 ? void 0 : providerConfig.blockNumber}.`
            : ``}`);
        const poolAddressToPool = {};
        const invalidPools = [];
        for (let i = 0; i < sortedPoolAddresses.length; i++) {
            const slot0Result = slot0Results[i];
            const liquidityResult = liquidityResults[i];
            console.log("FunctionGetPools forloop", JSON.stringify({ slot0Result, liquidityResult }));
            // These properties tell us if a pool is valid and initialized or not.
            if (!(slot0Result === null || slot0Result === void 0 ? void 0 : slot0Result.success) ||
                !(liquidityResult === null || liquidityResult === void 0 ? void 0 : liquidityResult.success) ||
                slot0Result.result.sqrtPriceX96.eq(0)) {
                const [token0, token1, fee] = sortedTokenPairs[i];
                console.log("FunctionGetPools push", JSON.stringify({ token0, token1, fee }));
                invalidPools.push([token0, token1, fee]);
                continue;
            }
            const [token0, token1, fee] = sortedTokenPairs[i];
            const slot0 = slot0Result.result;
            const liquidity = liquidityResult.result[0];
            const pool = new Pool(token0, token1, fee, slot0.sqrtPriceX96.toString(), liquidity.toString(), slot0.tick);
            const poolAddress = sortedPoolAddresses[i];
            poolAddressToPool[poolAddress] = pool;
        }
        if (invalidPools.length > 0) {
            log.info({
                invalidPools: _.map(invalidPools, ([token0, token1, fee]) => `${token0.symbol}/${token1.symbol}/${fee / 10000}%`),
            }, `${invalidPools.length} pools invalid after checking their slot0 and liquidity results. Dropping.`);
        }
        const poolStrs = _.map(Object.values(poolAddressToPool), poolToString);
        log.debug({ poolStrs }, `Found ${poolStrs.length} valid pools`);
        return {
            getPool: (tokenA, tokenB, feeAmount) => {
                console.log("THIIIIIIIIIIIIIISSSSSSSSSSS");
                const { poolAddress } = this.getPoolAddress(tokenA, tokenB, feeAmount);
                console.log("THIIIIIIIIIIIIIISSSSSSSSSSS2");
                console.log({ poolAddress, poolAddressToPool });
                return poolAddressToPool[poolAddress];
            },
            getPoolByAddress: (address) => poolAddressToPool[address],
            getAllPools: () => Object.values(poolAddressToPool),
        };
    }
    getPoolAddress(tokenA, tokenB, feeAmount) {
        console.log({
            tokenA,
            tokenB,
            feeAmount
        });
        const [token0, token1] = tokenA.sortsBefore(tokenB)
            ? [tokenA, tokenB]
            : [tokenB, tokenA];
        console.log({
            token0, token1
        });
        const cacheKey = `${this.chainId}/${token0.address}/${token1.address}/${feeAmount}`;
        console.log({ cacheKey });
        const cachedAddress = this.POOL_ADDRESS_CACHE[cacheKey];
        console.log({ POOL_ADDRESS_CACHE: this.POOL_ADDRESS_CACHE });
        if (cachedAddress) {
            return { poolAddress: cachedAddress, token0, token1 };
        }
        const poolAddress = computePoolAddress({
            factoryAddress: V3_CORE_FACTORY_ADDRESSES[this.chainId],
            tokenA: token0,
            tokenB: token1,
            fee: feeAmount,
        });
        console.log({ poolAddress, V3_CORE_FACTORY_ADDRESSES_: V3_CORE_FACTORY_ADDRESSES[this.chainId], V3_CORE_FACTORY_ADDRESSES });
        this.POOL_ADDRESS_CACHE[cacheKey] = poolAddress;
        return { poolAddress, token0, token1 };
    }
    async getPoolsData(poolAddresses, functionName, providerConfig) {
        const { results, blockNumber } = await retry(async () => {
            return this.multicall2Provider.callSameFunctionOnMultipleContracts({
                addresses: poolAddresses,
                contractInterface: IUniswapV3PoolState__factory.createInterface(),
                functionName: functionName,
                providerConfig,
            });
        }, this.retryOptions);
        log.debug(`Pool data fetched as of block ${blockNumber}`);
        return results;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicG9vbC1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvdjMvcG9vbC1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFFQSxPQUFPLEVBQUUsa0JBQWtCLEVBQWEsSUFBSSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDdEUsT0FBTyxLQUFrQyxNQUFNLGFBQWEsQ0FBQztBQUM3RCxPQUFPLENBQUMsTUFBTSxRQUFRLENBQUM7QUFFdkIsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sdURBQXVELENBQUM7QUFDckcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDakUsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGdCQUFnQixDQUFDO0FBQ3JDLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxtQkFBbUIsQ0FBQztBQThEakQsTUFBTSxPQUFPLGNBQWM7SUFLekI7Ozs7O09BS0c7SUFDSCxZQUNZLE9BQWdCLEVBQ2hCLGtCQUFzQyxFQUN0QyxlQUFtQztRQUMzQyxPQUFPLEVBQUUsQ0FBQztRQUNWLFVBQVUsRUFBRSxFQUFFO1FBQ2QsVUFBVSxFQUFFLEdBQUc7S0FDaEI7UUFOUyxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBb0I7UUFDdEMsaUJBQVksR0FBWixZQUFZLENBSXJCO1FBakJILHlFQUF5RTtRQUN6RSxrREFBa0Q7UUFDMUMsdUJBQWtCLEdBQThCLEVBQUUsQ0FBQztJQWdCdkQsQ0FBQztJQUVFLEtBQUssQ0FBQyxRQUFRLENBQ25CLFVBQXVDLEVBQ3ZDLGNBQStCO1FBRS9CLE1BQU0sY0FBYyxHQUFnQixJQUFJLEdBQUcsRUFBVSxDQUFDO1FBQ3RELE1BQU0sZ0JBQWdCLEdBQXFDLEVBQUUsQ0FBQztRQUM5RCxNQUFNLG1CQUFtQixHQUFhLEVBQUUsQ0FBQztRQUN6QyxPQUFPLENBQUMsR0FB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