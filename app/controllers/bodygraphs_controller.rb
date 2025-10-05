class BodygraphsController < ApplicationController
  include ActionView::Helpers::SanitizeHelper
  # Prefer a service/model over helpers for build logic, but leaving as-is:
  include BodygraphsHelper

  before_action :set_bodygraph, only: %i[show edit update destroy]

  def index
    @bodygraphs = Bodygraph.all
  end

  def show; end

  def new
    @bodygraph = Bodygraph.new
  end

  def edit; end

  def create
    # If build_bodygraph returns an instance, fine; otherwise do Bodygraph.new(bodygraph_params)
    @bodygraph = build_bodygraph(bodygraph_params)

    respond_to do |format|
      if @bodygraph.save
        format.html { redirect_to bodygraph_url(@bodygraph), notice: "Bodygraph was successfully created." }
        format.json { render :show, status: :created, location: @bodygraph }
      else
        format.html { render :new, status: :unprocessable_entity }
        format.json { render json: @bodygraph.errors, status: :unprocessable_entity }
      end
    end
  end

  def update
    # Don’t reassign @bodygraph; update the one loaded by set_bodygraph
    # If you need to apply computed attributes, do it directly to @bodygraph here.
    respond_to do |format|
      if @bodygraph.update(bodygraph_params)
        format.html { redirect_to bodygraph_url(@bodygraph), notice: "Bodygraph was successfully updated." }
        format.json { render :show, status: :ok, location: @bodygraph }
      else
        format.html { render :edit, status: :unprocessable_entity }
        format.json { render json: @bodygraph.errors, status: :unprocessable_entity }
      end
    end
  end

  def destroy
    @bodygraph.destroy
    respond_to do |format|
      format.html { redirect_to bodygraphs_url, notice: "Bodygraph was successfully destroyed." }
      format.json { head :no_content }
    end
  end

  private

  def set_bodygraph
    @bodygraph = Bodygraph.find(params[:id])
  end

  # Trim this list to only user-entered fields; compute the rest server-side.
  def bodygraph_params
    params.require(:bodygraph).permit(
      :name, :birth_date, :birth_time, :birth_date_local, :birth_country, :birth_city, :timezone,
      # keep these only if truly user-provided:
      :birth_date_utc, :design_date_utc, :all_activated_gates
    )
  end
end
 S