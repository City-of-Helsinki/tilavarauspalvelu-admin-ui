import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { useParams } from "react-router-dom";
import { Notification } from "hds-react";
import styled from "styled-components";
import uniq from "lodash/uniq";
import trim from "lodash/trim";
import { ContentContainer, IngressContainer } from "../../styles/layout";
import LinkPrev from "../LinkPrev";
import withMainMenu from "../withMainMenu";
import { H1, H3 } from "../../styles/typography";
import { getApplicationRound, getApplications } from "../../common/api";
import {
  Application as ApplicationType,
  ApplicationRound as ApplicationRoundType,
  DataFilterConfig,
} from "../../common/types";
import Loader from "../Loader";
import DataTable, { CellConfig } from "../DataTable";
import {
  formatNumber,
  getNormalizedApplicationStatus,
  parseDuration,
} from "../../common/util";
import StatusCell from "../StatusCell";

interface IRouteParams {
  applicationRoundId: string;
}

const Wrapper = styled.div`
  width: 100%;
`;

const Title = styled(H1)`
  margin: var(--spacing-layout-xl) 0 var(--spacing-2-xs);
`;

const ApplicationRoundTitle = styled.div`
  margin-bottom: var(--spacing-layout-xl);
`;

const ApplicationCount = styled(H3)`
  font-size: var(--fontsize-heading-s);
  text-transform: lowercase;
`;

const getFilterConfig = (
  applications: ApplicationType[]
): DataFilterConfig[] => {
  const applicantTypes = uniq(applications.map((app) => app.applicantType));
  const statuses = uniq(applications.map((app) => app.status));

  return [
    {
      title: "Application.headings.applicantType",
      filters: applicantTypes
        .filter((n) => n)
        .map((value) => ({
          title: `Application.applicantTypes.${value}`,
          key: "applicantType",
          value: value || "",
        })),
    },
    {
      title: "Application.headings.applicationStatus",
      filters: statuses.map((status) => {
        const normalizedStatus = getNormalizedApplicationStatus(
          status,
          "review"
        );
        return {
          title: `Application.statuses.${normalizedStatus}`,
          key: "status",
          value: status,
        };
      }),
    },
  ];
};

const getCellConfig = (t: TFunction): CellConfig => {
  return {
    cols: [
      { title: "Application.headings.customer", key: "organisation.name" },
      {
        title: "Application.headings.participants",
        key: "organisation.activeMembers",
        transform: ({ organisation }: ApplicationType) => (
          <>{`${formatNumber(
            organisation?.activeMembers,
            t("common.volumeUnit")
          )}`}</>
        ),
      },
      {
        title: "Application.headings.applicantType",
        key: "applicantType",
        transform: ({ applicantType }: ApplicationType) =>
          applicantType ? t(`Application.applicantTypes.${applicantType}`) : "",
      },
      {
        title: "Application.headings.applicationCount",
        key: "aggregatedData.reservationsTotal",
        transform: ({ aggregatedData }: ApplicationType) => (
          <>
            {trim(
              `${formatNumber(
                aggregatedData?.reservationsTotal,
                t("common.volumeUnit")
              )} / ${parseDuration(aggregatedData?.minDurationTotal)}`,
              " / "
            )}
          </>
        ),
      },
      {
        title: "Application.headings.reviewStatus",
        key: "status",
        transform: ({ status }: ApplicationType) => {
          const normalizedStatus = getNormalizedApplicationStatus(
            status,
            "review"
          );
          return (
            <StatusCell
              status={normalizedStatus}
              text={`Application.statuses.${normalizedStatus}`}
            />
          );
        },
      },
    ],
    index: "id",
    sorting: "organisation.name",
    order: "asc",
    rowLink: ({ id }) => `/application/${id}`,
  };
};

function Applications(): JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [
    applicationRound,
    setApplicationRound,
  ] = useState<ApplicationRoundType | null>(null);
  const [applications, setApplications] = useState<ApplicationType[] | []>([]);
  const [cellConfig, setCellConfig] = useState<CellConfig | null>(null);
  const [filterConfig, setFilterConfig] = useState<DataFilterConfig[] | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { applicationRoundId } = useParams<IRouteParams>();
  const { t } = useTranslation();

  useEffect(() => {
    const fetchApplicationRound = async () => {
      setErrorMsg(null);
      setIsLoading(true);

      try {
        const result = await getApplicationRound({
          id: Number(applicationRoundId),
        });
        setApplicationRound(result);
        setIsLoading(false);
      } catch (error) {
        const msg =
          error.response?.status === 404
            ? "errors.applicationRoundNotFound"
            : "errors.errorFetchingData";
        setErrorMsg(msg);
        setIsLoading(false);
      }
    };

    fetchApplicationRound();
  }, [applicationRoundId]);

  useEffect(() => {
    const fetchApplications = async (id: number) => {
      setErrorMsg(null);
      setIsLoading(true);

      try {
        const result = await getApplications({
          applicationRound: id,
          status: "in_review,review_done,declined",
        });
        setCellConfig(getCellConfig(t));
        setFilterConfig(getFilterConfig(result));
        setApplications(result);
        setIsLoading(false);
      } catch (error) {
        const msg = "errors.errorFetchingApplications";
        setErrorMsg(msg);
        setIsLoading(false);
      }
    };

    if (applicationRound) {
      fetchApplications(applicationRound.id);
    }
  }, [applicationRound, t]);

  if (isLoading || !applicationRound) {
    return <Loader />;
  }

  return (
    <Wrapper>
      <ContentContainer>
        <LinkPrev route={`/applicationRound/${applicationRoundId}`} />
      </ContentContainer>
      <IngressContainer>
        <Title>{t("Application.allApplications")}</Title>
        <ApplicationRoundTitle>{applicationRound.name}</ApplicationRoundTitle>
        <ApplicationCount data-testid="application-count">
          {applications.length} {t("common.volumeUnit")}
        </ApplicationCount>
      </IngressContainer>
      {cellConfig && filterConfig && (
        <DataTable
          groups={[{ id: 1, data: applications }]}
          hasGrouping={false}
          config={{
            filtering: true,
            rowFilters: true,
            handledStatuses: ["validated", "handled", "declined"],
            selection: false,
          }}
          cellConfig={cellConfig}
          filterConfig={filterConfig}
        />
      )}
      {errorMsg && (
        <Notification
          type="error"
          label={t("errors.functionFailed")}
          position="top-center"
          autoClose={false}
          dismissible
          closeButtonLabelText={t("common.close")}
          displayAutoCloseProgress={false}
          onClose={() => setErrorMsg(null)}
        >
          {t(errorMsg)}
        </Notification>
      )}
    </Wrapper>
  );
}

export default withMainMenu(Applications);