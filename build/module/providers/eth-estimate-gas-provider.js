import { BigNumber } from '@ethersproject/bignumber';
import { ChainId } from '@uniswap/sdk-core';
import { SwapType } from '../routers';
import { BEACON_CHAIN_DEPOSIT_ADDRESS, log } from '../util';
import { calculateGasUsed, initSwapRouteFromExisting, } from '../util/gas-factory-helpers';
import { SimulationStatus, Simulator } from './simulation-provider';
// We multiply eth estimate gas by this to add a buffer for gas limits
const DEFAULT_ESTIMATE_MULTIPLIER = 1.2;
export class EthEstimateGasSimulator extends Simulator {
    constructor(chainId, provider, v2PoolProvider, v3PoolProvider, portionProvider, overrideEstimateMultiplier) {
        super(provider, portionProvider, chainId);
        this.v2PoolProvider = v2PoolProvider;
        this.v3PoolProvider = v3PoolProvider;
        this.overrideEstimateMultiplier = overrideEstimateMultiplier !== null && overrideEstimateMultiplier !== void 0 ? overrideEstimateMultiplier : {};
    }
    async ethEstimateGas(fromAddress, swapOptions, route, l2GasData, providerConfig) {
        const currencyIn = route.trade.inputAmount.currency;
        let estimatedGasUsed;
        if (swapOptions.type == SwapType.UNIVERSAL_ROUTER) {
            if (currencyIn.isNative && this.chainId == ChainId.MAINNET) {
                // w/o this gas estimate differs by a lot depending on if user holds enough native balance
                // always estimate gas as if user holds enough balance
                // so that gas estimate is consistent for UniswapX
                fromAddress = BEACON_CHAIN_DEPOSIT_ADDRESS;
            }
            log.info({ addr: fromAddress, methodParameters: route.methodParameters }, 'Simulating using eth_estimateGas on Universal Router');
            try {
                estimatedGasUsed = await this.provider.estimateGas({
                    data: route.methodParameters.calldata,
                    to: route.methodParameters.to,
                    from: fromAddress,
                    value: BigNumber.from(currencyIn.isNative ? route.methodParameters.value : '0'),
                });
            }
            catch (e) {
                log.error({ e }, 'Error estimating gas');
                return {
                    ...route,
                    simulationStatus: SimulationStatus.Failed,
                };
            }
        }
        else if (swapOptions.type == SwapType.SWAP_ROUTER_02) {
            try {
                estimatedGasUsed = await this.provider.estimateGas({
                    data: route.methodParameters.calldata,
                    to: route.methodParameters.to,
                    from: fromAddress,
                    value: BigNumber.from(currencyIn.isNative ? route.methodParameters.value : '0'),
                });
            }
            catch (e) {
                log.error({ e }, 'Error estimating gas');
                return {
                    ...route,
                    simulationStatus: SimulationStatus.Failed,
                };
            }
        }
        else {
            throw new Error(`Unsupported swap type ${swapOptions}`);
        }
        estimatedGasUsed = this.adjustGasEstimate(estimatedGasUsed);
        log.info({
            methodParameters: route.methodParameters,
            estimatedGasUsed: estimatedGasUsed.toString(),
        }, 'Simulated using eth_estimateGas on SwapRouter02');
        const { estimatedGasUsedUSD, estimatedGasUsedQuoteToken, quoteGasAdjusted, } = await calculateGasUsed(route.quote.currency.chainId, route, estimatedGasUsed, this.v2PoolProvider, this.v3PoolProvider, l2GasData, providerConfig);
        return {
            ...initSwapRouteFromExisting(route, this.v2PoolProvider, this.v3PoolProvider, this.portionProvider, quoteGasAdjusted, estimatedGasUsed, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, swapOptions),
            simulationStatus: SimulationStatus.Succeeded,
        };
    }
    adjustGasEstimate(gasLimit) {
        var _a;
        const estimateMultiplier = (_a = this.overrideEstimateMultiplier[this.chainId]) !== null && _a !== void 0 ? _a : DEFAULT_ESTIMATE_MULTIPLIER;
        const adjustedGasEstimate = BigNumber.from(gasLimit)
            .mul(estimateMultiplier * 100)
            .div(100);
        return adjustedGasEstimate;
    }
    async simulateTransaction(fromAddress, swapOptions, swapRoute, l2GasData, 
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _providerConfig) {
        const inputAmount = swapRoute.trade.inputAmount;
        if (inputAmount.currency.isNative ||
            (await this.checkTokenApproved(fromAddress, inputAmount, swapOptions, this.provider))) {
            return await this.ethEstimateGas(fromAddress, swapOptions, swapRoute, l2GasData);
        }
        else {
            log.info('Token not approved, skipping simulation');
            return {
                ...swapRoute,
                simulationStatus: SimulationStatus.NotApproved,
            };
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXRoLWVzdGltYXRlLWdhcy1wcm92aWRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9wcm92aWRlcnMvZXRoLWVzdGltYXRlLWdhcy1wcm92aWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMEJBQTBCLENBQUM7QUFFckQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG1CQUFtQixDQUFDO0FBRTVDLE9BQU8sRUFBMEIsUUFBUSxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzlELE9BQU8sRUFBRSw0QkFBNEIsRUFBRSxHQUFHLEVBQUUsTUFBTSxTQUFTLENBQUM7QUFDNUQsT0FBTyxFQUNMLGdCQUFnQixFQUNoQix5QkFBeUIsR0FDMUIsTUFBTSw2QkFBNkIsQ0FBQztBQUlyQyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFLcEUsc0VBQXNFO0FBQ3RFLE1BQU0sMkJBQTJCLEdBQUcsR0FBRyxDQUFDO0FBRXhDLE1BQU0sT0FBTyx1QkFBd0IsU0FBUSxTQUFTO0lBS3BELFlBQ0UsT0FBZ0IsRUFDaEIsUUFBeUIsRUFDekIsY0FBK0IsRUFDL0IsY0FBK0IsRUFDL0IsZUFBaUMsRUFDakMsMEJBQThEO1FBRTlELEtBQUssQ0FBQyxRQUFRLEVBQUUsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQzFDLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1FBQ3JDLElBQUksQ0FBQyxjQUFjLEdBQUcsY0FBYyxDQUFDO1FBQ3JDLElBQUksQ0FBQywwQkFBMEIsR0FBRywwQkFBMEIsYUFBMUIsMEJBQTBCLGNBQTFCLDBCQUEwQixHQUFJLEVBQUUsQ0FBQztJQUNyRSxDQUFDO0lBRUQsS0FBSyxDQUFDLGNBQWMsQ0FDbEIsV0FBbUIsRUFDbkIsV0FBd0IsRUFDeEIsS0FBZ0IsRUFDaEIsU0FBNkMsRUFDN0MsY0FBK0I7UUFF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